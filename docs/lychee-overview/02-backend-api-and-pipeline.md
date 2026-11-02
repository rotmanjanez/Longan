# Lychee backend: API surface and media pipeline (reference for "Longan")

Source: `/tmp/lychee-src/Lychee` (Laravel 12 / PHP 8.4, spatie/laravel-data, Octane/FrankenPHP; Vue 3 frontends v7 legacy + v8 current).
Legend: `(opt)` = judged non-essential for a trimmed port. `SE` = Supporter Edition gate (`support:se|pro` middleware). `[SoA]` = needs `features.struct-of-array` (env `STRUCT_OF_ARRAY_ENABLED`, default **false**).

---
## 1. Routes

### 1.0 Conventions
- Five route files, mounted in `app/Providers/RouteServiceProvider.php`: `api_v2.php` + `api_v2_shop.php` -> `/api/v2`, `api_v2_embed.php` -> `/api/v2` (own `embed` middleware group, no session), `api_v3.php` -> `/api/v3`, `web_v2.php` (+ `web-install.php`, `web-admin-v2.php` phpinfo) -> `/`.
- v2 naming is RPC-ish `Resource` / `Resource::action` (e.g. `POST /Album::move`, `GET /Photo::random`); verbs: GET read, POST create/action, PATCH partial edit, PUT replace/merge, DELETE with **JSON body** of ids (no `/{id}` in the path for most). v3 is RESTful-ish, GET only, path params (`/Albums/{album_id}/Photos/buckets`).
- `api` middleware group (`app/Http/Kernel.php`): ResolveConfigs (loads whole `configs` table), ResolveVerify (SE licence), SetLocale, `accept_content_type:json`, `content_type:json` (multipart/any opt-outs per route), EncryptCookies, StartSession, AuthenticateSession, **VerifyCsrfToken**, `gallery_password`, Latency, ResolveAlbumSlug.
- CSRF is enforced on *every* `/api/v2` verb incl. GET (`VerifyCsrfToken::isReading()` returns false unless vite proxy), skipped only when an `Authorization` header (API token) is present or the URI is whitelisted (Zip, Photo::random, FaceDetection/NSFW callbacks, Shop finalize).
- IDs: 24-char URL-safe base64 random strings (`IdFactory::createRandomID`); users/access_permissions use int ids; smart albums use enum string ids (`unsorted`, `recent`, `timeline`...).
- Per-route middlewares worth knowing: `login_required:root|album|always`, `cache_control[:age]` (sets `private, no-cache` or `private, max-age=N`), `throttle:N,M`, `support:se|pro`, `feature:ai-vision|v8`, `config_integrity`, `content_type:multipart`.

### 1.1 Albums (all `/api/v2`, controller ns `Gallery\`)
| Method | Path | Controller | Purpose |
|---|---|---|---|
| GET | /Albums | AlbumsController@get | Root listing (albums, smart, tag/person/pinned, shared) v2 AoS |
| GET | /Album::head / ::albums / ::photos / ::tags | AlbumHeadController / AlbumChildrenController / AlbumPhotosController / AlbumTagsController | Album split into head (meta+rights), paginated children, paginated photos, tag-album content |
| GET | /Album::getTargetListAlbums | AlbumController | Album tree for move/merge picker |
| POST | /Album::unlock | AlbumController@unlock | Enter album password; id stored in session |
| POST/PATCH/DELETE | /Album | AlbumController@createAlbum / updateAlbum / delete | Create (returns id string), edit (title, desc, sorting, license, layout, copyright, timeline mode), delete tree |
| PATCH | /Album::rename, /Album::setPinned | AlbumController | Rename, pin |
| POST | /Album::updateProtectionPolicy | AlbumController | Public/link-required/NSFW/download/full-photo/upload grant + password (hashed) |
| POST | /Album::move, ::merge, ::transfer | AlbumController | Nested-set move; merge into target; transfer ownership |
| POST | /Album::cover, ::header | AlbumController | Set cover photo / header (banner) photo |
| PATCH | /Album::header | AlbumController (pro) (opt) | Header focus/size |
| POST/DELETE | /Album::track, /Album::tracks (+PATCH) | AlbumController / AlbumTracksController (opt) | GPX upload (multipart), multi-track CRUD |
| POST | /Album::watermark | AlbumController (SE) (opt) | Re-watermark all photos |
| POST/PATCH | /TagAlbum, /PersonAlbum | AlbumController | Create/update tag album (tag filter) / person album (opt) |
| GET | /Zip/chunks, /Zip | ZipController | Chunk count; stream ZIP (`?albums=&photos=&variant=&chunk=`) |

### 1.2 Photos
| Method | Path | Controller | Purpose |
|---|---|---|---|
| POST | /Photo | PhotoController@upload | One multipart **chunk** of an upload (see 4.1) |
| POST | /Photo::fromUrl | PhotoController | Import from URLs |
| PATCH | /Photo | PhotoController@update | Title, description, tags, license, taken_at, created_at, is_360 |
| PATCH | /Photo::rename, ::tags, ::license | PhotoController | Bulk rename / set tags / set license |
| POST | /Photo::move, ::copy | PhotoController | Move or link-duplicate into another album (`photo_album` pivot) |
| POST | /Photo::highlight, ::setRating, ::rotate | PhotoController | Favourite flag, 1-5 stars, rotate +-90 (regenerates variants) |
| POST | /Photo::watermark | PhotoController (SE) (opt) | Watermark one photo |
| GET | /Photo/{photo_id}/albums | PhotoController@albums | Albums containing a photo |
| DELETE | /Photo | PhotoController@delete | Delete (queues FileDeleterJob) |
| GET | /Photo::random, /Frame | FrameController (opt) | Random photo for frame/slideshow display |

### 1.3 Upload / import
POST /Photo, /Photo::fromUrl (above); `GET /Gallery::getUploadLimits` (chunk size, parallelism, watermark opt-out, folder upload); `POST|GET /Import`, `GET /Import::browse` -> Admin\ImportFromServerController (opt: server-side dir import); `GET /Jobs` -> Admin\JobsController (job history table).

### 1.4 Sharing / permissions
| Method | Path | Controller | Purpose |
|---|---|---|---|
| GET | /Sharing, /Sharing::all, /Sharing::albums | SharingController | List grants per album / all / albums shareable |
| POST/PATCH/DELETE | /Sharing | SharingController | Create/edit/delete a user (or group) grant (`grants_full_photo_access/download/upload/edit/delete/move`) |
| PUT | /Sharing | SharingController@propagate | Copy grants to descendants |
| GET | /Albums::accessPermissions [v3] | AlbumAccessPermissionListController | Flat SoA list for bulk-share page (opt) |
| GET/POST/PATCH/DELETE | /UserGroups, /UserGroups/Users | Admin\UserGroups* (SE) (opt) | Groups and membership/roles |
| GET/PATCH/DELETE/POST | /BulkAlbumEdit(::ids/::setOwner) | Admin\BulkAlbumController (opt) | Admin bulk album ops |

### 1.5 Users / auth / session
| Method | Path | Controller | Purpose |
|---|---|---|---|
| POST | /Auth::login, ::logout | AuthController | Username(or email)+password login (throttle 10/60), logout (flush session) |
| GET | /Auth::user, ::rights, ::config | AuthController | Current user, global rights (what UI may show), auth config (providers, webauthn, ldap flags) |
| POST | /Admin::Setup | ProfileController@store | First admin creation (only while no admin exists) |
| POST/PUT | /Profile::update, ::resetToken, ::unsetToken, PUT /Profile | ProfileController | Own profile, API token reset/unset, registration (invite) |
| POST | /Profile::updateSharedAlbumsVisibility | ProfileController (opt) | UI pref |
| GET | /Users, /Users::count | UsersController | User list for sharing pickers |
| GET/POST/PATCH/DELETE | /UserManagement, ::invite | Admin\UserManagementController | Admin user CRUD, invitation link |
| * | /WebAuthn, /WebAuthn::register(/options), ::login(/options) | WebAuthn\* (opt) | Passkeys |
| GET/DELETE | /Oauth::providers, /Oauth | OauthController (opt) | Provider list / unlink; browser flow in web routes `/auth/{provider}/{redirect,authenticate,register}` |
| POST | /Gallery::unlock | GalleryUnlockController (opt) | Site-wide password -> encrypted cookie |

### 1.6 Search
`GET /Search::init`, `GET /Search?term=<base64>&page` -> SearchController (v2 AoS, 300/page). Query grammar (`SearchTokenParser`): plain text plus modifiers `title: description: location: tag: date: type: ratio: color: make: lens: aperture: iso: shutter: focal: model: rating:`; strategies in `app/Actions/Search/Strategies`. v3 [SoA]: `GET /Search/Photos`, `/Search/Photos/details`, `/Search/albums`, `/Search/albums/rights` (whole-scope, capped with `is_truncated`; no bucket tier).

### 1.7 Map
`GET /Map`, `/Map::provider` (v2, unbounded). v3 [SoA]: `GET /Map/buckets` (viewport-snapped grid cells: ids, counts, centroid lat/lng, singleton photos), `/Map/Photos` (leaf tier, cap+1 -> refuse), `/Map/tracks` (GPX), `/Map/album` (header points; not flag-gated).

### 1.8 Timeline / Flow
`GET /Timeline`, `/Timeline::dates`, `/Timeline::init` (v2, paginated, "count-youngers" trick). v3 timeline = the smart album id `timeline` through `/Albums/timeline/Photos{,/buckets,/details,/urls}`. Flow (album feed, `flow_max_items`): `GET /Flow`, `/Flow::init` v2; `GET /Flow` v3 [SoA] unpaginated album SoA, previews via `/Albums/{id}/Photos?limit=N`.

### 1.9 Tags
`GET /Tags`, `GET /Tag`, `PATCH /Tag` (rename), `PUT /Tag` (merge), `DELETE /Tag` -> TagController. Tag-albums (`TagAlbum`) are saved tag filters (feature 026/050/098 add AND/OR logic, categories).

### 1.10 Smart albums
Not routes: virtual `AbstractAlbum` singletons (`app/SmartAlbums`): unsorted, highlighted, recent, on_this_day, untagged, unrated, one..five_stars, best_pictures, my_rated_pictures, my_best_pictures, timeline. Fetched through the ordinary album endpoints with the enum string as `album_id`; each toggled by a config key. v3: `GET /Albums/smart`, `/Albums/tags`, `/Albums/persons`, `/Albums/pinned` list the "other" root categories.

### 1.11 Settings / config / maintenance
| Method | Path | Controller | Purpose |
|---|---|---|---|
| GET | /Gallery::Init, ::Footer, ::getLayout, ::getMac | ConfigController | Bootstrap config (InitConfig), footer, layout, temp-link MAC |
| GET | /Settings, ::init, ::getLanguages | Admin\SettingsController | All config rows grouped by category (+`level` expert) |
| POST | /Settings::setConfigs (`config_integrity`), ::setCSS, ::setJS | SettingsController | Write key/value configs; custom CSS/JS |
| GET/POST | /Maintenance::{cleaning,jobs,genSizeVariants,missingFileSize,fullTree,countDuplicates/searchDuplicates,statisticsIntegrity,missingPalettes,flushQueue,backfillAlbumSizes,...}, GET ::tree, POST ::optimize, ::flushCache, ::recomputeBuckets, ::register | Admin\Maintenance\* | ~25 check/do pairs (GET = count of work, POST = do it). Essential ones: genSizeVariants, missingFileSize, fullTree/tree (nested-set repair), recomputeBuckets, backfillAlbumSizes. Rest (opt) |
| GET | /Version, /ChangeLogs, /Admin/UpdateStatus, /Security/Advisories | Version/Admin (opt) | Update + CVE checks |

### 1.12 Statistics / insights / metrics (all SE) (opt)
`GET /Statistics::{sizeVariantSpace,albumSpace,totalAlbumSpace,getCountsOverTime}` (v2, replaced by Insights), `GET /Insights` v3 (feature 085: aggregates per owner/instance: overview, devices, exposure, places, rhythm, calendar...), `GET /Metrics`, `GET /Metrics` v3 live feed, `POST /Metrics::photo|::favourite` (visit/favourite beacons, no JSON content-type), `GET /Admin/Stats`.

### 1.13 AI vision / faces (`feature:ai-vision`+`feature:v8`) (opt, entire group)
External Python microservice (face detect/embed/cluster). Routes: `/People`, `/Person/{id}` (+claim/merge/photos/claim-by-selfie), `/Face/{id}/assign|batch|maintenance`, `/FaceDetection/{scan,bulk-scan,results,clusters...}` (results/cluster-results are callbacks, unauthenticated by session, API-key authed), `/Photo/{id}/faces`, `/Album/{id}/people`, `/Maintenance::*Face*`; v3: `/People`, `/Faces/queue`, `/Faces/{face_id}/photo/{variant}` (binary, like /Asset).

### 1.14 NSFW / moderation (opt)
`/NsfwDetection/{results (callback),bulk-scan,config,findings}` (SE), `/Photo/{id}/nsfw-detections`; `/Moderation`, `::photo`, `::approve`, `::history`, `::photoHistory` -> ModerationController (admin approval queue for untrusted uploads; `UserUploadTrustLevel` check|monitor|trust_but_verify|trusted, feature 033/045/089). Album-level `is_nsfw` (+ stored recursive flag, ADR-103) is *core*, the classifier and moderation queue are not.

### 1.15 Webshop (`api_v2_shop.php`, `support:pro`) (opt, whole file)
`/Shop` catalog; `/Shop/Order/{List,{id}}` (get, markAsPaid, markAsDelivered, forget); `/Shop/Basket/{Photo,Album,Print,Pixel,item}`; `/Shop/Checkout/{Options,Offline,Create-session,Process,Finalize/{provider}/{tx},Cancel}` (Omnipay); `/Shop/Management/{Options,List,Purchasable/*,PrintSize,PixelSize}`; `/Shop/Catalogue/Purchasable/{id}/Sizes`.

### 1.16 Landing / contact / embed / webhooks / renamer / diagnostics (all opt)
| Group | Endpoints | Notes |
|---|---|---|
| Landing | GET /LandingPage; CRUD /LandingLink(+Reorder), /LandingFeaturedItem(+Reorder) | Configurable public home (feature 054/025) |
| Contact | GET /Contact::Init, CRUD /Contact (SE) | Contact form + inbox, throttle 5/1440min |
| Embed | GET\|OPTIONS /Embed/{album_id}, /Embed/stream (`api_v2_embed.php`) | Session-less, CORS, `cache_control:300/900`, throttle 120/30 per min; public albums only; separate `vite.embed.config.ts` widget |
| Webhooks | CRUD /Webhook/{id} | Outgoing HTTP on `photo.add|move|delete`; `WebhookDispatchJob`, per-photo, optional secret header |
| Renamer | /Renamer (+::test, ::preview) (SE) | Regex-ish rule engine applied on upload/bulk (feature 017) |
| Diagnostics | GET /Diagnostics(::info,::space,::config,::permissions), /Admin/Stats | Env checks; `/phpinfo` web-admin |
| Web infra | `/up`, `/octane-health`, `/docs/api` (Scramble OpenAPI), RSS `Route::feeds()`, honeypot catch-all `{path}` | |

### 1.17 v3 summary (api_v3.php, 139 lines)
`GET /Asset/{album_id}/{photo_id}/{size_variant}` (binary); `GET /Albums`, `/Albums/root{,/buckets,/rights,/config}`, `/Albums/{album_id}{,/buckets,/rights}`, `/Albums/{album_id}/Photos{,/buckets,/details,/urls}`, `/Albums/{smart,tags,tags/rights,persons,pinned}`; `/Flow`; `/Search/*`; `/Map/*`; `/Metrics`; `/Insights`; `/People`, `/Faces/*`. Literal segments are registered before `{album_id}`.

### 1.18 Web (`web_v2.php`)
SPA shell via `VueController` for ~45 client routes (`/gallery/{albumId?}/{photoId?}`, `/flow`, `/map`, `/search`, `/timeline`, `/tags`, `/profile`, `/sharing`, `/admin/*`, `/login`, `/register`, `/frame`, `/people`...), with middlewares `migration:complete`, `legacy_id_redirect`, `unlock_with_password`, `resolve_album_slug` (friendly URLs, feature 019), `login_required:always`. Plus `GET /image/{path}` (`SecurePathController`, legacy file serving, no policy), `/migrate`, `/install/*`, `/auth/{provider}/*` (Socialite).

---
## 2. v3 "struct-of-arrays" + buckets listing

### 2.1 Problem
Target scale from the specs: ~700,000 photos, ~7,000 albums, single albums with 5-figure photo counts, 7,000+ direct sub-albums. v2 returns Array-of-Structs (`PaginatedPhotosResource` -> full `PhotoResource` per photo: ~26 fields, 9 size variants, EXIF, palette, stats) with page-based pagination; every loaded tile is a DOM node, deep links need "count younger" trick. Cost per row was the killer (hydrating Eloquent models, joins).

### 2.2 Design rules (ADR-0009, ADR-069-01)
- **SoA**: a collection is one object of index-aligned arrays (`{ids:[], titles:[], ratios:[]...}`), built from flat `toBase()` queries (no model hydration). Optional fields typed `array|Optional` are *omitted* from JSON when a config/policy gate is off (gates evaluated once per request, not per row). Single-item/binary endpoints are exempt (ADR-0009).
- Every v3 collection must pick one **bounding strategy**: (1) whole-scope unpaginated (albums in a tree, one album's photos' ratios), (2) bucket-windowed (open-ended + navigable axis: timeline, album photos), (3) capped with `is_truncated` (search), (4) capped with refusal (map leaf tier, falls back to aggregate tier). Caps are admin configs.
- Tiers per scope (album children, root, photos, timeline, tag/person/smart albums):
  1. `buckets` -> `{bucket_ids[], counts[], labels[], bucketable}`; labels are pre-rendered strings (no client date formatting). `bucketable=false` when sort column is `owner_id`.
  2. `ratios` (bare `/Photos`, or `/Albums/{id}` for children) -> per-row render data: `ids, titles, types, bucket_ids, ratios (w/h), owner_ids, is_highlighteds, is_validateds, is_videos, is_raws, is_live_photos, is_360s, taken_ats, created_ats, taken_at_orig_tzs` + optional `rating_avgs, rating_users, thumb_infos, tags`. Scope: whole album, `bucket_ids[]` (<=300), `photo_ids[]` (<=300) or `limit=N`; mutually exclusive.
  3. `details` (`?bucket_id=` or `?photo_ids[]=` <=300) -> heavy per-photo data: descriptions (raw + markdown HTML), tags, license, checksums, live-photo fields, panoramas, face_counts, nested `palette`, `size_variants` (all 9, nested object-per-row, a scoped SoA exception), `statistics`, optional EXIF/GPS/location arrays.
  4. `urls` (`?photo_ids[]=&density=1|2`) -> `{ids, grid_urls, thumb_urls}` direct file URLs for visible tiles (feature 102), `null` when file needs `/Asset` protection.
  5. `rights` -> permission flags for context menus, fetched in background after tier 2.
- Albums use the same split: `/Albums/{id}` (SoA of children: `ids,titles,descriptions,cover_ids,bucket_ids,owner_ids,is_password_requireds,is_nsfws,is_pinneds,is_publics,is_link_requireds,has_subalbums,num_photos,num_subalbums,created_ats,min_taken_ats,max_taken_ats`), `/buckets`, `/rights`. `/Albums` (feature 057) is a tiny tree list `{ids,titles,_lft,_rgt,cover_ids,can_edits[,parent_ids]}` for pickers; client rebuilds the tree from nested-set coords.

### 2.3 Bucket keys (feature 061/064/092, ADR-092-01/02)
- Stored, **granularity-free** keys: `photo_album.bucket_key` (photo-in-album edge; pivot because a photo can sit in several albums with different sorting) and `albums.bucket_key`; `photos.taken_key` = `taken_at` in the *capture-local zone* as `Y-m-d-H`; `photos.title_date_key` = leading date parsed from title; `title_base`/`title_index` split titles.
- Bucket id = SQL `SUBSTR(key,1,N)` at read time (`app/Services/BucketScheme.php`): year/month/day/hour -> 4/7/10/13 chars; alphabetical title -> first N chars; highlighted/type/rating -> whole value; NULL -> `"unknown"`. Switching granularity needs no recompute. Tag/person/smart/timeline sources compute the same id in SQL from photo columns.
- Window filters are half-open key ranges (index range on `(album_id, bucket_key)`). Ordering: NULL key last, bucket id, then sort criterion, so grouping `ratios` rows reproduces `buckets`.
- Maintained by jobs `RecomputePhotoBucketsJob`, `RecomputeAlbumPhotoBucketsJob`, `RecomputeChildAlbumBucketsJob`, `RecomputeAll*`, `lychee:recompute-buckets`; chunked writes (PostgreSQL 65,535-bind limit).

### 2.4 Frontend virtual scroll (v8)
`services/photo-children-v3-service.ts` -> `stores/AlbumState.ts`: (a) fetch `buckets` + `ratios` (whole album); (b) run `@lychee-org/layouts` (Rust/WASM: `justified|masonry|grid|square`, signature `(ratios: Float64Array, width, target, gap) -> {containerHeight, boxes}`) once per bucket run, with header pseudo-rows of 40px (`analyticPhotoLayout.ts`, `virtualAlbumRows.ts`) so every tile's absolute box is known without DOM; (c) `@tanstack/vue-virtual` mounts only visible rows; (d) for mounted/overscan photos request `details` and `urls` in chunks of 300; (e) date scrubber/rail ticks derived client-side from buckets (ADR-071-01); (f) `axios-cache-interceptor` ids per album+scope digest, server `ManagedCacheService` underneath. Payload size reference: 7,000 photos ratios = 1.2 MB raw / 229 KB gzip.

### 2.5 /Asset/{album_id}/{photo_id}/{size_variant} (feature 056, 102, ADR-0008)
- Binary passthrough (`PhotoAssetController` + `ServesSizeVariantAssetTrait`); `size_variant` in `raw|original|medium2x|medium|small2x|small|thumb2x|thumb|placeholder`; falls back along the variant chain.
- **Why it exists**: v2 `GET /image/{path}` served files by obscure path with *no policy check*, and `<img src>` cannot send headers. `/Asset` (1) enforces `PhotoPolicy` (`CAN_SEE` for thumb-class, `CAN_ACCESS_FULL_PHOTO` for medium/original/raw) **in the context of an album** so password-protected/unlocked albums and cover exceptions (tag/person/smart album thumbs via `album_user_thumbs`, ADR-0010) resolve correctly; (2) supports optional **temporary-link signing**: headers `X-Timestamp` + `X-Mac` = HMAC-SHA256(timestamp, `APP_KEY`), TTL `temporary_image_link_life_in_seconds`, toggles `temporary_image_link_enabled/_when_logged_in/_when_admin`; client fetches MAC via `GET /Gallery::getMac`, loads thumbs through axios as blobs/object URLs (`ThumbAssetService`); (3) is watermark-aware (`Watermarker::get_path`); (4) 302-redirects to S3 presigned URL for S3 variants.
- Feature 102 speed-ups: route group strips StartSession/CSRF/cookies/ResolveVerify and uses `ReadOnlyStartSession` (reads auth + unlocked albums, never writes, issues no cookies); admins skip album/membership queries; `Cache-Control: private, max-age=3600` + `Last-Modified` + `ETag`(path+mtime+size) + 304; baseline was ~9 ms warm / 18 queries. `/Photos/urls` lets tiles bypass `/Asset` entirely on instances without link protection; `/Faces/{face_id}/photo/{variant}` shares the serving code.

---
## 3. Request / response layer, DTOs, type generation

- **FormRequest base** `app/Http/Requests/BaseApiRequest.php` (~300 files incl. traits, grouped by domain folder). Overrides `validateResolved()` so **validate first, then authorize** (policy needs validated IDs). Subclasses implement: `rules()` (Laravel validation with custom rules `RandomIDRule`, `AlbumIDRule`, `TitleRule`, `FilenameRule`, `ChunkSequenceRule`, ...), `authorize()` (`Gate::check(AlbumPolicy::CAN_EDIT, [AbstractAlbum::class, $this->album])`, plus `features.struct-of-array` for v3), `processValidatedValues()` (resolve models: `album_factory->findAbstractAlbumOrFail($id, false)`). Typed accessors via interfaces + traits (`HasAbstractAlbum`/`HasAbstractAlbumTrait`, `HasPhotoIdsTrait`, `HasMapViewportTrait`...), so controllers receive resolved models.
- **Authorization**: `app/Policies/{AlbumPolicy,PhotoPolicy,UserPolicy,SettingsPolicy,AiVisionPolicy,...}` with string constants (`CAN_SEE, CAN_ACCESS, CAN_EDIT, CAN_UPLOAD, CAN_DOWNLOAD, CAN_DELETE, CAN_MOVE, CAN_SHARE, CAN_ACCESS_FULL_PHOTO, CAN_ACCESS_MAP...`). Query-side visibility filters live in `AlbumQueryPolicy::applyVisibilityFilter()` / `PhotoQueryPolicy` (SQL, used by every listing). Owner/admin/grant/public/unlocked-album logic is all there.
- **Errors**: typed exceptions (`UnauthenticatedException` 401, `UnauthorizedException` 403, `ValidationException` 422, `GalleryPasswordRequiredException`) rendered as JSON; `json_errors` middleware on binary routes.
- **Response layer**: controllers return `spatie/laravel-data` `Data` objects directly (207 classes `extends Data`, all `#[TypeScript()]`; only 1 legacy JsonResource). Namespaces mirror `app/Http/Resources/{Models,Collections,V3,Rights,GalleryConfigs,Editable,Admin,Flow,Search,Timeline,Insights,Shop,Embed,Frame,Diagnostics,Root,Oauth}`; `app/DTO/*` holds internal value objects (`SortingCriterion`, `MapViewport`, `ImportParam`, `ChunkSlice`, `PhotoCreate\*DTO`, `TopAlbumDTO`) and a few are also TS-exported. Resources often build from models with `fromModel()`; rights are separate resources (`AlbumRightsResource`, `GlobalRightsResource`, `ModulesRightsResource`) so the UI never infers permissions itself. Mutations mostly return `void`/an id string/`EditableBaseAlbumResource`.
- **TS generation**: `spatie/laravel-typescript-transformer` v3, configured in `app/Providers/TypeScriptTransformerServiceProvider.php`: `LaravelDataTypeScriptTransformerExtension` + `AttributedClassTransformer` + `EnumTransformer`, `transformDirectories(app_path())`, `GlobalNamespaceWriter('lychee.d.ts')` into `resources/js/`, Prettier formatter. Run: `php artisan typescript:transform` (`make gen_typescript_types`). Output `resources/js/lychee.d.ts` (2,316 lines, committed): one `declare namespace App { namespace Http.Resources.V3 { export type PhotoBucketResource = {...} } namespace Enum { export type AlbumLayoutType = "list"|"grid"; } namespace DTO {...} }`. Frontend aliases them in service files (`type PhotoBucketResource = App.Http.Resources.V3.PhotoBucketResource`). `scripts/generate-js-types.sh` is *not* this; it only runs a vite build to emit `auto-imports.d.ts`/`components.d.ts` for vue-tsc.
- **Gaps (important for a port)**: only *responses* + enums are typed; request payloads are hand-typed in `resources/js/services/*-service.ts` (~50 files of thin axios wrappers) and validation rules exist only server-side. OpenAPI is generated separately by `dedoc/scramble` at `/docs/api`.
- **Longan implication**: one shared package with zod schemas for request+response, enums as `z.enum`, `z.infer` types consumed by both server and Vue; SoA response types are plain tuples of arrays; `Optional` -> optional keys.

---
## 4. Upload + media pipeline

### 4.1 Chunked upload (`PhotoController@upload`, `UploadPhotoRequest`, `UploadMetaResource`)
- Client slices file by `upload_chunk_size` (config; `0` = min(`upload_max_filesize`, `post_max_size`, `memory_limit/10`)); runs up to `upload_processing_limit` files in parallel. Each `POST /Photo` (multipart) carries: `file` (chunk), `file_name`, `uuid_name` (`null` on chunk 1; server allocates `base64url(12 bytes)+ext` and returns it), `extension`, `chunk_number` (1-based), `total_chunks`, `album_id` (nullable = unsorted), `file_last_modified_time` (ms), optional `apply_watermark`, `title`, `description`.
- `ChunkSequenceRule` takes a mutex per `uuid_name` to force in-order chunks (released after append via `completeChunkUpload`). Server appends bytes to `storage/.../IMAGE_UPLOAD/<uuid_name>`; non-last chunk returns meta `stage=uploading`.
- Last chunk: file copied to a `ProcessableJobFile`, `expected_id` pre-allocated (so `ProcessImageJob` creates the photo with that id, UI can open it), job dispatched; `stage` = `done` if `QUEUE_CONNECTION=sync` (the default) else `ready`. `FileStatus`: uploading|processing|ready|skipped|done|error. `.zip` + SE `extract_zip_on_upload` -> `ExtractZip` job (SafeZipExtractor). Job rows recorded in `jobs_history` (`GET /Jobs`).
- Authorization: `AlbumPolicy::CAN_UPLOAD` (guest uploads allowed via `grants_upload` on public albums; trust level resolved at dispatch time while session exists).

### 4.2 `Actions\Photo\Create` pipeline (Laravel `Pipeline` of "pipes", `app/Actions/Photo/Pipes/*`; `docs`: `app/Actions/Photo/README.md`)
1. **Init pre-pipes**: `DetectAndStoreRaw` (RAW/HEIC/PSD -> Imagick JPEG q92, original kept as RAW variant), `AssertSupportedMedia`, `FetchLastModifiedTime`, `MayLoadFileMetadata`, `FindDuplicate`.
2. **Dedup**: `sha1` of file (`StreamStat`, `hash_file`) compared against `photos.checksum OR original_checksum OR live_photo_checksum` (global, not per album). If found -> *duplicate strategy*: `ThrowUnownedDuplicate` (config `skip_duplicates_not_owned`), optional metadata resync (`HydrateMetadata`+`SaveIfDirty`), `ThrowSkipDuplicate` (config `skip_duplicates` -> `PhotoSkippedException`), `ThrowUntrustedDuplicate` (pending moderation copy), else `SetHighlighted`, `Save`, `SetParent` (**links the existing photo into the target album**, no new files), `SaveStatistics`.
3. **Post-pipes**: `InitParentAlbum`, `LoadFileMetadata` (EXIF), `FindLivePartner` (same `live_photo_content_id`, opposite kind, same album, partner without live short_path).
4. Branch: no partner -> **standalone**; partner video -> `VideoPartner` (GetVideoPath, PlaceVideo, UpdateLivePartner); partner photo -> import photo standalone, attach old video, then `PhotoPartner` finalize (SetOldChecksum, DeleteOldVideoPartner). Plain "replace"/"photo-into-album" are exactly these strategies; there is no separate user-facing replace endpoint.
5. **Standalone pipes (in order)**: FixTimeStamps, InitNamingStrategy, ApplyUserProvidedMetadata, HydrateMetadata, SetHighlighted, SetOwnership, SetOriginalChecksum, FetchSourceImage, ExtractGoogleMotionPictures, PlacePhoto, PlaceGoogleMotionVideo, SetChecksum, AutoRenamer, SetUploadValidated (trust level), Save, SetParent (writes `photo_album.bucket_key`), SaveStatistics, CreateOriginalSizeVariant, CreateRawSizeVariant, **CreateSizeVariants**, ApplyWatermark, **EncodePlaceholder**, ReplaceOriginalWithBackup, UploadSizeVariantsToS3, **GeodecodeLocation** (job), **ExtractColourPalette** (job), NotifyAlbums (events -> cache + stats recompute), AutoScanFaces/AutoScanNsfw (jobs), RecordUploadHold. On `LycheeException` the half-created Photo row is deleted. Size-variant failures are swallowed (logged), never fail the import.

### 4.3 Metadata / EXIF (`app/Metadata/Extractor.php`, lib `lychee-org/php-exif` 1.5)
Reader priority: **ffprobe** (videos) -> **exiftool** -> Imagick -> native PHP exif. `.xmp` sidecar read when exiftool is present. Extracts make/model/lens/aperture/shutter/focal/ISO/GPS lat-lng-alt/taken_at(+orig tz)/orientation/duration/fps/live_photo_content_id/micro_video_offset/XMP-GPano (-> `PanoramaDetector`: `is_360`, `pano_full_*`, `pano_crop_*`). Write-back: `EmbedMetadataJob` + `Metadata\Writer` via exiftool (feature 059). Reverse geocoding: `GeodecodeLocationJob` via `geocoder-php` (Nominatim/OSM, rate limited, optional local endpoint) -> `photos.location`.

### 4.4 Size variants (`app/Image/SizeVariantDefaultFactory.php`, `SizeVariantDimensionHelpers`)
- Enum values: 0 RAW, 1 ORIGINAL, 2 MEDIUM2X, 3 MEDIUM, 4 SMALL2X, 5 SMALL, 6 THUMB2X, 7 THUMB, 8 PLACEHOLDER (table `size_variants`: photo_id, type, short_path, width, height, filesize, storage_disk).
- Defaults (configs): `small_max_width=0, small_max_height=360`; `medium_max_width=1920, medium_max_height=1080`; `*2x` = 2x those, toggles `small_2x/medium_2x/thumb_2x`; THUMB fixed 200x200 crop, THUMB2X 400x400 crop, PLACEHOLDER 16x16 crop (`low_quality_image_placeholder`). Variant is created only if the source is at least that large; videos skip medium. `compression_quality=90` (0 = lossless where possible), `size_variant_format` = original|jpeg|webp|jxl (feature 073), optional `lossless_optimization`.
- **Backends**: Imagick preferred (`config imagick`), **GD fallback** (`ImageHandler` tries engines in order). No libvips. Imagick: autorotate from EXIF orientation, `scaleImage`, `cropThumbnailImage`, composite for watermark. Ghostscript via Imagick for PDF (guard: MediaBox <=32,000pt and area/byte limit, feature 081/099). JXL needs Imagick with JXL delegate (`hasJxl`, ADR-101). Rotation action regenerates variants.
- Storage: disks `images` (local) or `s3`; naming `SizeVariantGroupedWithRandomSuffixNamingStrategy`: `<type>/<2hex>/<2hex>/<28hex>.<ext>` (128-bit random, all variants of a photo share the suffix). Local files are exposed via `public/uploads` or `/image/{path}`/`/Asset`.
- Placeholder: 16px image re-encoded with GD at JPEG q30 (<=189 bytes) then **base64 data URL stored in `size_variants.short_path`** (no blurhash/thumbhash).
- Colour palette: `ExtractColoursJob`, config `colour_extraction_driver` -> League ColorExtractor (GD, 5 colours) or `farzai/color-palette`; stored in `palettes`; also feeds `color:` search modifier.

### 4.5 Video, live photos, motion photos, RAW, 360, PDF
- **Video**: ffmpeg/ffprobe via `php-ffmpeg` (`VideoHandler`); thumbnail frame = `video_thumbnail_frame_mode` (first|middle|custom seconds); frame goes through the same size-variant factory; original video stored as ORIGINAL variant. Supported: avi,m4v,mov,mp4,mpg,ogv,webm,wmv.
- **Apple live photo**: image + .mov paired by `live_photo_content_id`; video stored next to photo (`live_photo_short_path`, `live_photo_checksum`).
- **Google motion photo** (feature 100): XMP `MicroVideoOffset` / Motion Photo 1.0 container located by php-exif `MotionPhotoLocator`; `GoogleMotionPictureHandler` slices the MP4 tail out with ffmpeg and stores `.mov` next to the original (ADR-100-01).
- **RAW** (feature 020): NEF CR2 CR3 ARW DNG ORF RW2 RAF PEF SRW NRW PSD HEIC HEIF -> Imagick JPEG; raw kept as variant 0, download gated by `raw_download_enabled`.
- **360** (feature 082): `is_360` + crop from GPano; v8 in-house WebGL2 renderer (ADR-082-01).
- **Image types**: jpg jpeg png gif webp avif heic heif jxl (+pdf accepted).

### 4.6 Watermark
`Watermarker` (needs Imagick; the explicit `/Photo::watermark` and `/Album::watermark` routes are `support:se`; config `watermark_enabled`, `watermark_photo_id`, `watermark_original`, `watermark_public`, `watermark_logged_in_users_enabled`, `watermark_optout_disabled`): composites a configured photo onto variants (opacity/position configs) producing a parallel file set (`WatermarkGroupedWithRandomSuffix...`); `get_path()` chooses watermarked vs plain per viewer. `WatermarkerJob` for bulk (opt).

### 4.7 GPX tracks
`tracks` table (multi per album, feature 055), validated by `GpxValidation`, stored `tracks/<rand>.xml` on local or S3; rendered client-side with `leaflet-gpx`; `/Map/tracks`.

### 4.8 Queue / jobs / worker mode (feature 002)
- `QUEUE_CONNECTION` default `sync` (everything inline); recommended `database`/`redis` with a second container `LYCHEE_MODE=worker` running `php artisan queue:work --queue=high,default,low --tries=3 --timeout=3600 --max-time=...` (entrypoint auto-restart, crash-loop healthcheck). Octane/FrankenPHP in web mode. Scheduler: only a weekly `lychee:photos_added_notification`.
- Dominant jobs (`app/Jobs`): `ProcessImageJob` (the whole Create pipeline), `ExtractZip`, `ImportImageJob`, `ExtractColoursJob`, `GeodecodeLocationJob`, `FileDeleterJob` (post-delete file removal), `UploadSizeVariantToS3Job`, `EmbedMetadataJob`, `WatermarkerJob`, `WebhookDispatchJob`, the `Recompute*` family (album size/stats/user-thumbs/buckets; dedup via feature 090; run on `low`), `CheckTreeState`, face/NSFW dispatch jobs (opt). Events (`app/Events`: PhotoSaved, AlbumSaved, PhotoAdded, AccessPermissionChanged...) -> listeners that recompute stats/buckets and invalidate managed-cache tags.
- Artisan commands (`app/Console/Commands`): generate_thumbs, video_data, takedate, recompute-buckets/sizes/stats, FixTree, Sync (dir watcher), Ghostbuster (orphan files), Diagnostics.

---
## 5. Album operations

- **Create** (`Actions\Album\Create`): nested-set insert under a **cache lock** (`album_tree_insert`, 30s) so concurrent folder drops do not share `_lft/_rgt`; copies parent permissions (`set_permissions`), title split (`title_base/title_index`), stats row, `AlbumSaved` event. `Album` model uses `lychee-org/nestedset` (kalnoy/nestedset-style API) `NodeTrait`: columns `parent_id,_lft,_rgt`; moves go only through `appendNode/saveAsRoot/makeRoot`.
- **Move** (`Move`): `appendNode` per album, `fixOwnershipOfChildren`, `SyncRecursiveNsfw`, events. **Merge**: re-link photos in `photo_album` (dedupe), move sub-albums under target, delete sources via `Delete`. **Transfer**: change `owner_id`, detach to root, drop the new owner's grant. **Delete**: collects tags/person/regular albums, validates tree first, deletes photos+variants in DB and dispatches `FileDeleterJob` per disk (tracks included); parent stats recomputed via `AlbumDeleted`.
- **Cover/header**: `albums.cover_id` (manual) else auto cover stored as `auto_cover_id_max_privilege` (owner/admin view) and `auto_cover_id_least_privilege` (most restrictive view), plus per-viewer rows in `album_user_thumbs` (`RecomputeAlbumUserThumbsJob`); `albums.header_id` + `header_photo_focus` for the banner (`SetHeader`).
- **Sort**: per-album `album_sorting_col/order`, `photo_sorting_col/order`, falling back to configs `sorting_albums_col`/`sorting_photos_col`; enum `ColumnSortingType` (owner_id, created_at, title, min/max_taken_at, taken_at, is_highlighted, type, rating_avg); title sorting uses `title_base`+`title_index` (natural number order, feature 060).
- **Nested-set maintenance**: `Maintenance::tree/fullTree` + `lychee:FixTree`; browser-side verification via `@lychee-org/nested-set-checker-wasm` (`resources/js/v8/composables/album/treeOperations.ts`: `prepareAlbums`, `getModifiedAlbums`, fed an SoA sorted by `_lft`, i.e. the v3 `GET /Albums?with_parent_id=true` shape) to check/repair `_lft/_rgt` without server load.
- **ZIP download** (`ZipController`, `Actions\Album\Archive32/64`, `Zip\*`, `maennchen/zipstream-php`): streamed `StreamedResponse`, albums recursive with directory structure, optional `variant` (original|medium|small|thumb, feature 021; RAW gated), chunked mode (`download_archive_chunked`, `download_archive_chunk_size`=300 photos): `GET /Zip/chunks` -> `{total_chunks,total_photos}`, client downloads `archive.part<n>.zip` sequentially (independent ZIPs, feature 035). `/Zip` is CSRF-exempt and accepts any content type.
- **Sharing** (`access_permissions` rows): per album either public row (`user_id` and `user_group_id` NULL: `is_link_required`, `password` hash, `grants_full_photo_access`, `grants_download`, `grants_upload`) or per-user/group row (+`grants_edit/delete/move`); `SetProtectionPolicy` creates/deletes public row; `Share`, `Propagate` (to descendants); multi-group merge ADR-0004; revocation purges `album_user_thumbs` (ADR-0010).
- **Smart albums**: see 1.10; `BaseSmartAlbum::photos()` applies `PhotoQueryPolicy` + a closure condition; thumbnails computed.
- **Tag albums**: `tag_albums` with tag filter over `photos_tags`; photos come from the query, not the pivot (so bucket keys are computed in SQL). Person albums same via faces.
- **Timeline** v3: smart album `timeline` bucketed by `taken_key`/`created_at` (config `timeline_photos_granularity` year|month|day|hour, date formats `timeline_photo_date_format_*`). **Flow**: album feed ordered by `base_albums.published_at` desc (strategy `FlowStrategy`, OPT_IN = only albums with `published_at` set; else created_at; feature 068), skips NSFW per config, cards fetch a few previews. **Map**: grid snapped to viewport/zoom (`MapViewport::snapToGrid`), `FLOOR(lat/cell), FLOOR(lng/cell)` group-by, composite index `(latitude, longitude)`, cache key by snapped grid.

---
## 6. Auth-adjacent (what a Keycloak-only port must replace)

- **Session/CSRF**: Laravel session cookie (file/db/redis store), `XSRF-TOKEN` cookie read by axios (`csrf-getter.ts`, header `X-XSRF-TOKEN`); `AuthenticateSession` middleware. Guard `lychee` = custom `SessionOrTokenGuard` (`app/Services/Auth/`): session OR `Authorization` header token (user column `token`, SHA-512 hashed; `Profile::resetToken/unsetToken`; env `ENABLE_TOKEN_AUTH`), plus remember-me recaller cookie (`REMEMBER_LIFETIME` 40320 min, feature 023, checkbox on login).
- **Login**: `AuthController@login` -> LDAP first if SE+`LDAP_ENABLED`+ext-ldap (`LdapRecord`, `ProvisionLdapUser`), fallback local password; identifier is username or (if `email_login_enabled`) email. Throttle 10/60.
- **OAuth**: Laravel Socialite + SocialiteProviders; `OauthProvidersType`: amazon apple authelia authentik facebook github google kanidm mastodon microsoft nextcloud pocketid **keycloak**. Flow: `/auth/{provider}/authenticate` redirect -> `/auth/{provider}/redirect` callback; when already logged in the same callback *registers* the credential (`oauth_credentials`: user_id, provider, provider_user_id); logged-out callback authenticates by linked credential. Keycloak is already supported as an OIDC login, but the app still keeps its own `users` table, sessions and permissions.
- **WebAuthn**: `laragear/webauthn`, passkeys per user, `/WebAuthn*` routes, disable with `DISABLE_WEBAUTHN`.
- **Global (gallery) password** (feature 074): config hash `gallery_password` hash -> `POST /Gallery::unlock` sets an encrypted cookie; `gallery_password` middleware blocks all API except exempted routes (`withoutMiddleware(['gallery_password'])`); web shell `unlock_with_password`.
- **Album unlock**: `POST /Album::unlock` -> `AlbumPolicy::unlock()` pushes id onto session key `unlocked_albums`; unlocking one album unlocks all with the same password (`Unlock::propagate`). That session set is part of cache keys (`unlockedAlbumsDigest`) and of `ReadOnlyStartSession` reads for assets.
- **Guest rules**: configs `login_required`, `login_required_root_only`, `LoginRequired` middleware; public albums via the public `access_permissions` row (`is_link_required` hides from listings, link still works).
- **Install/admin**: `/install/*` wizard + `POST /Admin::Setup`; users have `may_administrate, may_upload, may_edit_own_settings, quota, upload_trust_level`.
- **What to replace**: user store + login + remember-me + token + OAuth + WebAuthn + LDAP + CSRF/session -> Keycloak JWT/OIDC (stateless bearer, no CSRF); keep: album-password unlock (needs a signed cookie or JWT claim instead of session `unlocked_albums`), per-album grants (map Keycloak sub -> local `users` row or use groups/roles for admin/uploader), API tokens (-> Keycloak service accounts / PATs).

---
## 7. Caching and SE gating

- **Layers**: (1) HTTP: `cache_control` middleware (`private, no-cache` default for identity-dependent JSON, explicit `max-age` only for identity-free routes like Embed), `/Asset` max-age 3600 + ETag; (2) **ManagedCacheService** (features 052/053, `app/Services/Cache`): tag-evictable memoization over any Laravel cache store; tags are themselves cache entries listing member keys (works on `file` store); `rememberIf($enabled,$key,$tags,$fn,ttl)`; configs `managed_cache_albums_enabled`, `managed_cache_ttl`; `CacheKeyProvider` builds keys per (album, scope digest, user id, unlocked-albums digest) and tags (`photoListingTag`, per-bucket tags, `userTag`, global tags). Invalidated by events -> listeners `ManagedCache{Album,Photo,Map,Search,User}ListingInvalidator`. Caches queries, never whole HTTP responses. (3) legacy `RouteCacher` whole-response cache (`ENABLE_CACHING`, default off) (opt). (4) Client: `axios-cache-interceptor` (`config/client-cache.ts`, toggle meta `lychee-client-cache` from `CLIENT_CACHE_ENABLED`), cache ids per service call; cleared on login/logout (`useClearViewerState`, FR-102-08); Pinia stores (+persistedstate) for albums/photos/tile URLs.
- **Config system**: DB table `configs` (key, value, `cat`, `type_range`, `level` expert flag, secret) loaded whole per request by `ResolveConfigs` into request attribute `configs` (`ConfigManager::getValueAsBool/Int/String/Enum/ByteSize`); `hasImagick/hasExiftool/hasFFmpeg/hasJxl` probes. Env-driven feature flags in `config/features.php` (v8, struct-of-array, ai-vision, webshop, webhook, client-cache, use-s3, disable-webauthn, ...).
- **SE (Supporter Edition) gating**: package `lychee-org/lycheeverify` (`LycheeVerify\Verify`). Licence key + email stored in configs (`license_key`, `Maintenance::register`); `ResolveVerify` middleware creates one `Verify` per request (skipped for `/Asset`); `support:se|pro` route middleware (`VerifySupporterStatus`) rejects otherwise; `is_supporter()` checked inline (LDAP, zip extract, watermark, white-label). `InitConfig` exposes `is_se_enabled/is_se_expired` to the UI. SE-gated: statistics/insights/live metrics, user groups, renamer, contact, watermark ops, NSFW config/findings, zip extraction, LDAP, white label; `pro`: webshop, album header edit. A port can drop the whole mechanism and leave these features on or off.

---
## 8. Essentials vs Optional (recommendation)

### Essential core (build first)
1. **Albums**: nested tree (`parent_id` + a way to keep ordering; either nested-set or `ltree`/closure), CRUD, move, merge, delete, cover, sort settings, rename, description; root listing; album head + children + photos.
2. **Photos**: chunked upload -> checksum dedup -> EXIF -> original + thumb/small/medium (+2x) variants -> DB; rotate, edit title/desc/tags/taken_at, highlight/star-rating, move/copy (many-to-many photo<->album), delete (+ async file cleanup).
3. **Variant serving endpoint** with album-aware authorization and long-lived caching headers (the `/Asset` idea, dropping MAC signing initially, keep `ETag`/`Last-Modified`).
4. **Permissions/sharing**: owner/admin, per-user grants (view/download/upload/edit/delete/move/full-photo), public link (+ optional album password via signed unlock cookie), NSFW album flag; all expressed as an SQL visibility filter shared by every listing.
5. **Large-library listing contract**: v3 SoA + buckets + ratios + details (+`/rights`) with server-side bucket keys; WASM/JS justified layout + virtualizer on the client. Keep `taken_key` (capture-local), `title_base/index`, `photo_album.bucket_key`.
6. **Search** (basic: text + tag + date + type), **tags** (list/rename/merge), **smart albums** (unsorted, recent, highlighted, untagged, starred), **timeline** (bucketed), **map** (bounded grid buckets + singleton photos), **ZIP download** (streamed, per variant, optional chunking).
7. **Media probes**: sharp/libvips or Imagick-equivalent resize + autorotate; exiftool/ffprobe for metadata; ffmpeg frame for video thumbs; 16px base64 placeholder; HEIC/RAW -> JPEG conversion.
8. **Config table** + `Gallery::Init` style bootstrap + rights resources; **queue** with a worker mode (BullMQ/pg-boss) for processing, file deletion and recomputes; managed cache with tag eviction (or just per-album version counters).
9. **Type safety**: shared zod/TS schemas generated both ways (Lychee only generates response types).

### Nice-to-have (second wave)
Live photos + Google motion photos; GPX tracks; colour palette + `color:` search; reverse geocoding; 360 viewer; PDF/JXL; watermarking; pinned albums; tag albums; on-this-day; Flow feed; Embed widget; webhooks; renamer rules; RSS; import-from-server / sync command; user groups; quota; upload trust levels.

### Fluff / skip for a minimal port
Webshop (whole `api_v2_shop.php`, Omnipay, orders, print/pixel sizes), SE licence machinery, statistics/insights/metrics/live metrics, AI vision (faces, people, clustering, selfie claim) and NSFW classifier/moderation history, contact form, landing-page builder, WebAuthn, LDAP, Socialite providers (replace with Keycloak), local user management/registration/invitations/email login, global gallery password, temp-link MAC signing, Scramble OpenAPI, installer/migrate wizard, diagnostics/maintenance zoo (keep: regenerate variants, tree check, recompute buckets), security advisories/update checker, honeypot, log viewer, v7 legacy frontend, v2 AoS endpoints (build only v3-style from the start), Frame/slideshow, bulk album edit, custom CSS/JS settings, multi-track GPX UI, face-photo assets.

---
## 9. Suggested minimal endpoint set for Longan (derived from the above)

| Domain | Endpoints (v3-style, SoA for collections) |
|---|---|
| Bootstrap | `GET /init` (config + user + global rights), `GET /albums/root{,/buckets,/rights}` |
| Albums | `GET /albums/{id}{,/buckets,/rights}`, `GET /albums/{id}/head`, `POST /albums`, `PATCH /albums/{id}`, `POST /albums/move|merge|cover|header`, `DELETE /albums` (ids in body), `GET /albums/tree` (SoA with `_lft/_rgt` or parent ids) |
| Photos | `GET /albums/{id}/photos{,/buckets,/details,/urls}`, `PATCH /photos`, `POST /photos/move|copy|rotate|highlight|rating`, `DELETE /photos` |
| Upload | `POST /upload` (chunk contract of 4.1: `uuid_name`, `chunk_number`, `total_chunks`, `album_id`), `GET /upload/config` |
| Assets | `GET /asset/{album_id}/{photo_id}/{variant}` (policy + ETag/304) |
| Sharing | `GET/POST/PATCH/DELETE /sharing`, `POST /albums/{id}/protection`, `POST /albums/{id}/unlock` |
| Discovery | `GET /search/photos{,/details}`, `GET /search/albums`, `GET /tags` (+rename/merge/delete), `GET /map/buckets|photos`, timeline as pseudo-album `timeline`, smart albums as pseudo-albums |
| Download | `GET /zip/chunks`, `GET /zip` |
| Admin | `GET/POST /settings`, `POST /maintenance/{genSizeVariants,recomputeBuckets,fixTree}`, `GET /jobs`, user list for sharing (identity comes from Keycloak) |

## 10. Where to read next (file index)
- Routes: `routes/api_v2.php`, `routes/api_v3.php`, `app/Providers/RouteServiceProvider.php`, `app/Http/Kernel.php` (middleware groups + aliases).
- Listing: `app/Http/Controllers/Gallery/AlbumListing/*`, `app/Actions/Photo/StructOfArrays/*`, `app/Actions/Album/StructOfArrays/*`, `app/Http/Resources/V3/*`, `app/Services/BucketScheme.php`, `BucketKeys.php`, `PhotoBucketComputer.php`, specs `docs/specs/4-architecture/features/{057,061,062,064,066,067,092,102}-*/spec.md`, ADRs `0008`, `0009`, `069-01`, `092-01`, `102-01`.
- Frontend listing: `resources/js/stores/{AlbumState,TimelineState,TileUrlsState}.ts`, `resources/js/services/photo-children-v3-service.ts`, `resources/js/v8/composables/photo/analyticPhotoLayout.ts`, `resources/js/v8/composables/album/virtualAlbumRows.ts`, `resources/js/v8/layouts/wasmLayouts.ts`.
- Upload/media: `app/Http/Controllers/Gallery/PhotoController.php`, `app/Http/Requests/Photo/UploadPhotoRequest.php`, `app/Jobs/ProcessImageJob.php`, `app/Actions/Photo/Create.php`, `app/Actions/Photo/Pipes/**`, `app/Image/**`, `app/Metadata/Extractor.php`, `app/Services/Image/FileExtensionService.php`, `docs/specs/3-reference/image-processing.md`.
- Albums/sharing: `app/Actions/Album/*`, `app/Actions/Sharing/*`, `app/Models/{Album,AccessPermission}.php`, `app/Policies/{AlbumPolicy,AlbumQueryPolicy,PhotoPolicy}.php`.
- Auth: `app/Http/Controllers/{AuthController,OauthController}.php`, `app/Services/Auth/SessionOrTokenGuard.php`, `config/auth.php`, `app/Services/GalleryLockState.php`.
- Typing: `app/Providers/TypeScriptTransformerServiceProvider.php`, `resources/js/lychee.d.ts`, `app/Http/Requests/BaseApiRequest.php`.
- Cache: `app/Services/Cache/*`, `app/Listeners/ManagedCache*Invalidator.php`, `docs/specs/3-reference/managed-cache-service.md`, `resources/js/config/{client-cache,axios-config}.ts`.

## 11. Core tables a port must model (from `database/migrations`, `docs/specs/3-reference/database-schema.md`)
| Table | Key columns / notes |
|---|---|
| `base_albums` + `albums` (+`tag_albums`, `person_albums`) | base: id, title, title_base/index, description, owner_id, is_nsfw, sorting cols, license, copyright, published_at, created_at; albums: parent_id, `_lft`, `_rgt`, cover_id, header_id, auto_cover_*, min/max_taken_at, bucket_key, is_recursive_nsfw |
| `photos` | id, title (+base/index/date_key), description, owner_id, type (mime), checksum / original_checksum / live_photo_checksum (sha1), taken_at (+orig tz, `taken_key`), initial_taken_at, lat/lng/alt, location, EXIF strings, duration/fps, live_photo_content_id/short_path, is_highlighted, is_validated, nsfw_status, rating_avg, is_360 + pano fields, license, `month_day_key` |
| `photo_album` | pivot (photo_id, album_id, bucket_key); index (album_id, bucket_key) |
| `size_variants` | photo_id, type 0-8, short_path (or base64 placeholder), width, height, filesize, storage_disk |
| `access_permissions` | base_album_id, user_id / user_group_id / both NULL = public, is_link_required, password, grants_* |
| `tags`, `photos_tags`, `palettes`, `statistics` (per photo/album), `album_size_statistics`, `album_user_thumbs`, `tracks`, `photo_ratings` | supporting |
| `users` (quota_kb, may_upload, upload_trust_level, token), `oauth_credentials`, `user_groups`, `configs`, `jobs_history`, `webhooks`, `live_metrics` | admin/infra |
