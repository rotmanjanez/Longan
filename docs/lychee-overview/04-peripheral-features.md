# Lychee peripheral / cross-cutting features: size and cut list for Longan

Source: `/tmp/lychee-src/Lychee` (Laravel 13 / PHP 8.4 backend, Vue 3 frontend). Assumptions for the port: auth is externally managed (Keycloak OIDC), no photo selling, minimal fluff.

## 0. How to read the numbers

- LOC are `wc -l` of files. For "feature" rows they are **filename-pattern approximations** (e.g. `*webhook*`, `*landing*`) plus the obvious dirs. Treat them as +/-20%. Migrations and lang files are not included unless said so.
- Whole-repo reference points: `app/` 126.9k PHP; `resources/js` 123k (v7 38.4k, v8 62.0k, shared 20.1k); `tests/` 111.8k (excl. 473k-line sample data); `database/` 35.8k (583 migrations); `lang/` 99.6k over 23 locales; `routes/` 914.
- Columns used below: **PHP** = backend (app+routes+config), **v8** / **v7** = the two Vue trees, **tests** = PHPUnit.
- Two parallel frontends exist. **v7** = legacy PrimeVue UI. **v8** = new Nuxt UI tree (`resources/js/v8`, toggled by `config/features.php` `nuxt_ui`, default false; `docs/specs/6-decisions/ADR-0006`). Many newer features are "v8 only". The port only needs the v8 numbers.
- A third API generation (`routes/api_v3.php`, struct-of-arrays responses, flag `struct-of-array`, default false) sits next to `api_v2.php` (475 lines). Both exist for the same data.
- Status column of `docs/specs/4-architecture/roadmap.md`: features 001-106 (feature folders go to 106; 102 folders exist; numbers 076, 083, 084, 104 are absent). Almost everything from 073 onward is "Testing", i.e. very recent and still churning.

## 1. SE (Supporter Edition) gating

**Mechanism.** Package `lychee-org/lycheeverify` (`LycheeVerify\Verify`, `LycheeVerify\Http\Middleware\VerifySupporterStatus`), registered in `app/Http/Kernel.php:149` as route middleware alias `support`.
- `support:se` -> `is_supporter()` must be true; `support:pro` -> `is_pro()` (Pro tier is higher). Anything else is HTTP error.
- `ResolveVerify` middleware (first entry of `web`/`web-admin`/`api` groups) resolves `Verify` **once per request** and scopes it in the container.
- License key stored in `configs.license_key`; `Admin/Maintenance/RegisterController` validates a pasted key (keygen.sh backend), `RotateLicenseKeyJob` re-rotates on login, diagnostics pipes `SupporterCheck`, `KeygenApiTokenCheck`, `OldLicenseCheck` nag the admin. Free edition shows "Have you considered supporting Lychee?".
- **Per-setting gate**: `configs.level` column (0 free, 1 SE, 2 Pro). `ConfigKeyRequireSupportRule` (+ Boolean/Enum/Integer/String variants) rejects writes to level-1/2 keys when unlicensed. More than 100 config keys carry level 1/2.
- **In-code gates** (not routes): `SmartAlbumType::isEnabled()` (rating smart albums), `Photo\Create::checkQuota` (per-user quota only enforced if SE), `PhotoController` (zip extract-on-upload only if SE), `Renamer` (`is_enabled = renamer_enabled && is_supporter`), landing `isSeEnabled()`.

**Behind `support:se`** (all in `routes/api_v2.php` / `api_v3.php`): Contact form (5 routes), watermark-apply (`/Photo::watermark`, `/Album::watermark`), UserGroups (8 routes), Statistics space (4), Metrics (v2+v3), Insights (v3), Renamer (7), NSFW bulk-scan/config/findings (5), many config-level-1 settings (live metrics, rating display, timeline formats, trust-level settings, colour extraction, flow, ...).
**Behind `support:pro`**: the whole webshop group (`routes/api_v2_shop.php`) and `PATCH /Album::header`.

**Port recommendation: CUT the mechanism entirely** (no license server, no `level` column, no rule classes). All features ship ungated; this removes ~30 routes of middleware plumbing, 5 validation Rule classes, 3 diagnostic checks, 1 job, and the "Supporter" UI nags. The only residue is deciding which SE features to port (sections below).

## 2. Authentication stack

Backend total ~2.3k PHP (AuthController 233, OauthController 167, WebAuthn controllers 286, Oauth action 205, `Services/Auth` 685 (LdapService + SessionOrTokenGuard), OauthCredential 72, configs 250) + ~3.2k Vue/TS (LoginForm, RegisterPage, Profile forms, WebauthnModal, `vendor/webauthn.ts` 335) + 600+ tests. Composer deps: `laravel/socialite`, 13 `socialiteproviders/*`, `laragear/webauthn`, `directorytree/ldaprecord-laravel`.

| Part | What it does | Where | Size | Needs | Rec |
|---|---|---|---|---|---|
| Laravel session auth + login endpoint | `POST /Auth::login` (throttle 10/60), session cookie, logout, `/Auth::user`, `/Auth::rights`. Username+password; LDAP tried first, falls back to local | `AuthController`, `LoginRequest`, `config/auth.php` | ~400 PHP + ~450 Vue | Laravel session store | CUT (Keycloak does login). Keep only a "current user from JWT" endpoint |
| API token | `users.token` column, proprietary header, `SessionOrTokenGuard` (685 LOC file shared with LDAP) lets session OR token authenticate; reset/unset in Profile | `Services/Auth/SessionOrTokenGuard`, `Actions/User/Token*`, `ProfileController` | ~350 PHP | none | CUT; replace by Keycloak bearer JWT (service accounts for scripts) |
| OAuth (Socialite) | Provider enum (13): amazon, apple, authelia, authentik, facebook, github, google, kanidm, mastodon, microsoft, nextcloud, pocketid, keycloak. Table `oauth_credentials(provider, user_id, token_id)`. Login: look up credential -> `Auth::login`. Option `oauth_create_user_on_first_attempt` auto-provisions user (random password, `grant_new_user_*` rights). Linking an existing user uses a 5-min signed URL | `OauthController`, `Actions/Oauth/Oauth`, `Models/OauthCredential`, `config/services.php` (13 blocks) | ~730 PHP + ~195 Vue | provider client id/secret per provider | CUT (Keycloak already one of the 13; port needs one OIDC client, not 13). Reuse only the "auto-provision local user row on first login" idea |
| WebAuthn / passkeys | Register/list/rename/delete credentials, passkey login | `Http/Controllers/WebAuthn/*` (286), `config/webauthn.php`, `vendor/webauthn.ts` | ~490 PHP + ~575 Vue | HTTPS + `laragear/webauthn` | CUT (Keycloak supports passkeys itself) |
| LDAP (010) | `LdapService` search-first bind, `ProvisionLdapUser` syncs email/display_name, maps LDAP group -> admin; env-only config; falls back to local if unreachable | `Services/Auth/LdapService`, `Actions/User/ProvisionLdapUser`, `config/ldap.php`, DTOs | ~860 PHP + 1.6k tests, no Vue | `ext-ldap`, LDAP server | CUT (Keycloak federates LDAP) |
| Email-as-login (091) | setting `email_login_enabled`: identifier may be username or email; registration may omit username | `AuthController::resolveIdentifierAttribute`, `User\Create::resolveUsername` | ~60 PHP | none | CUT (Keycloak setting) |
| Remember-me (023) | checkbox -> Laravel remember cookie | AuthController + LoginForm | ~30 | none | CUT |
| Global password (074) | one shared gallery password locks every v2/v3 route for anonymous visitors, HMAC-encrypted unlock cookie; RSS and embeds disabled while set; account holders exempt | `Middleware/GalleryPasswordRequired`, `UnlockWithPassword`, `Services/GalleryLockState`, `GalleryUnlockController`, v8 `GalleryUnlock.vue` | ~350 PHP + ~180 Vue + 600 tests | none | DEFER (nice for private family galleries; cross-cuts every route, so decide before designing middleware) |
| Registration / invites | admin generates temporary signed invitation link (`user_invitation_ttl`), `PUT /Profile` registers, RegisterPage | `UserManagementController::invitationLink`, `ProfileController::register`, `RegisterPage.vue` (182 x2) | ~250 PHP + ~360 Vue | none | CUT (Keycloak self-registration/invites) |
| Admin setup page (051) | first-run creation of the admin user (v8 page) plus legacy Blade installer (Welcome/Requirements/Permissions/Env/Migration/SetUpAdmin, 7 controllers) | `Install/*` 477 PHP, `AdminSetupController`, `CreateInitialAdmin`, `AdminSetupPage.vue`, `docker/scripts/create-admin-user.sh`, `lychee:reset_admin` | ~480 PHP + ~100 Vue | none | CUT (admin = Keycloak role/claim) |
| User management | admin CRUD of users: `may_administrate`, `may_upload`, `may_edit_own_settings`, `quota_kb`, `upload_trust_level`, notes; `Users` list for sharing | `UserManagementController` 133, `UsersController` 46, `Actions/User` 578, `Users.vue` | ~800 PHP + ~600 Vue | none | KEEP a thin version: local `users` table keyed by OIDC `sub` (needed for ownership/sharing), no CRUD UI beyond role/quota |
| User groups (SE) | named groups with members and per-member role; groups can be share targets (`access_permissions`); feature 048 fixed multi-group merge | `Models/UserGroup`, `UserGroups*Controller`, `Requests/UserGroup`, `UserGroups.vue` | ~550 PHP + ~800 Vue + 620 tests | none | DEFER (map to Keycloak groups claims instead of own tables) |

User model fields worth keeping in mind: `username, email, may_administrate, may_upload, may_edit_own_settings, quota_kb, shared_albums_visibility, upload_trust_level, is_ldap, token, remember_token`.

## 3. Webshop (042/043; `docs/specs/4-architecture/shop-architecture.md`, 228 lines)

- **What**: owner marks albums/photos *purchasable* with price per size variant (MEDIUM, MEDIUM2X, FULL, ORIGINAL) and license type; visitors build a basket (basket = Order with status PENDING), checkout by Mollie, PayPal (REST SDK `paypal/paypal-server-sdk`), Stripe, or an offline/manual flow (`webshop_offline`); signed temporary download links; 043 adds physical **print sizes** and custom **pixel sizes** catalogues; guest checkout with email; maintenance jobs fulfil/flush/precompute orders.
- **Where**: `routes/api_v2_shop.php` (60 lines, ~35 routes), `app/Actions/Shop` (BasketService, CheckoutService, OrderService, PurchasableService, Gateway/PaypalGateway), `Http/Controllers/Shop/*` (5) + `Admin/ShopManagement|PrintSize|PixelSize*`, models `Order, OrderItem, Purchasable*, PrintSize, PixelSize`, `Services/MoneyService`, `OrderCompleted` event + listener, Maintenance `FulfillOrders, FulfillPreCompute, FlushOldOrders`, `config/omnipay.php`.
- **Size**: ~6.7k PHP (5.8k in dedicated dirs), v8 ~2.1k, v7 ~2.2k, shared ~0.6k, tests **~8.6k** (`tests/Webshop` 29 files). Plus ~10 migrations and ~40 `webshop_*` config keys (gated `support:pro`).
- **External deps**: `league/omnipay` + `omnipay/mollie|stripe|dummy`, PayPal SDK; payment provider credentials; HTTPS return/cancel URLs.
- **Rec: CUT.** Explicitly out of scope. It is the single largest peripheral block (~12k LOC non-test, ~20k with tests). Also remove `purchasable` hooks from album/photo resources and the Maintenance order tasks.

## 4. AI vision (030 faces/people, 047 person albums, 093 quick naming, 045 NSFW, 089 moderation history)

**Architecture**: Lychee does **no inference itself**. It calls two external Python services (separate Docker images in `docker-compose.yaml`):
- `ghcr.io/lycheeorg/lychee-facial-recognition` (env `AI_VISION_FACE_URL`, `AI_VISION_FACE_API_KEY`): `POST /detect`, `POST /match` (selfie), `POST /cluster` (DBSCAN), embeddings delete/sync, health. The service **reads the photo from a shared Docker volume path** and calls back `POST /api/v2/FaceDetection/results` (and `/cluster-results`) authenticated by a shared `X-API-Key`. Embeddings live in the service (volume `ai_vision_embeddings`).
- `ghcr.io/lycheeorg/lychee-nsfw-classification` (`AI_VISION_NSFW_URL`, `..._API_KEY`): `POST /api/nsfw/detect`, `/health`, `/config`; callback `POST /NsfwDetection/results`. Also `lychee-reverse-geo-coding` (`LOCAL_GEO_DECODING_URL`) as optional Nominatim replacement.
- Lychee side wrappers: `Services/Image/FacialRecognitionService` (247), `FaceDetectionService` (145), `NsfwDetectionService` (158), `NsfwActionService` (293), jobs `DispatchFaceScanJob, DispatchNsfwScanJob, DeleteFaceEmbeddingsJob, CleanupOrphanedPersonAlbumsJob, RecomputePersonStatsJob, ApplyNsfwAlbumSensitivityJob`, commands `lychee:scan-faces`, `lychee:rescan-failed-faces`, 6 face maintenance controllers, 3 diagnostic pipes.
- Gated by env flag `ai-vision` (default true) **and** `feature:v8`; routes in one group in `api_v2.php:396-475` (~50 routes) plus 3 in v3.

| Piece | What | Size (PHP / v8 / v7 / tests) | Rec |
|---|---|---|---|
| Faces + People (030) | Person (optional 1-1 User link, `is_searchable` privacy flag), Face (relative bbox, `crop_token`, dismissed flag, `FaceSuggestion`), assign/merge/claim, selfie-claim, cluster review page, per-photo face overlays, permission mode enum (4 values) | ~6.8k / ~4.2k / 3.5k / 6.6k | DEFER (high value, but needs an external ML service and 10k+ LOC; design hook only: store bbox+person later) |
| Person smart album (047) | `PersonAlbum` (TagAlbum clone) with AND/OR persons | in above | DEFER |
| Quick naming (093) | keyboard-first naming queue `/people/quick-naming` (v3 endpoints `/People`, `/Faces/queue`) | in above | DEFER |
| NSFW detection + moderation (045/089) | trust-tier x finding-tier action matrix (hold, hide, flag sensitive album), `nsfw_detections`, moderation queue page, append-only `photo_moderation_events`, findings page; 12+ config keys | ~2.9k / 1.5k / 1.0k / 3.8k | CUT (only useful for public multi-user upload galleries; SE-gated) |

If faces are ever added, treat them as a standalone sidecar contract (HTTP detect + callback) exactly as Lychee does; nothing in the core pipeline depends on it except two optional upload pipes (`AutoScanFacesOnUpload`, `AutoScanNsfwOnUpload`).

## 5. Upload trust level + moderation (033)

Per-user `upload_trust_level` enum: `check`, `monitor`, `trust_but_verify`, `trusted`; photos uploaded by lower tiers are held (`photos.is_validated=false`) until an admin approves on `Moderation.vue`; `guest_upload_trust_level` config for anonymous upload. Pipe `RecordUploadHold`/`SetUploadValidated`, `PhotoQueryPolicy` filters unvalidated, `ModerationController` (5 routes). ~900 PHP + ~870 Vue (shared with NSFW numbers above). **Rec: CUT** (multi-tenant community-gallery concern; with Keycloak-only trusted users it adds a filter to every photo query).

## 6. Landing page (025, 039, 054)

- **What**: public `GET /LandingPage` (`LandingPageController`, `LandingPageResource` 400+ lines) returns hero/backgrounds/links/featured items. 054 makes it a layout picker with **4 layouts**: `classic`, `portfolio`, `meridian`, `studio` (`LandingLayoutType`). Cross-cutting options: text position, animation preset (6 new enums), CTA placement, about block, extra links (`LandingLink` model + CRUD), featured items (`LandingFeaturedItem` model, auto or manual with reorder), backgrounds (025: static URL, random public, latest album covers, random from album), intro screen. 039 white-label: `WHITE_LABEL_ENABLED` env hides Lychee name/links/generator meta.
- **Where**: `app/Http/Controllers/LandingPageController`, `Admin/LandingLink*|LandingFeaturedItem*Controller`, `Models/Landing*`, `Enum/Landing*`, v8 `views/Landing.vue` + `views/landing/{Classic,Portfolio,Meridian,Studio}.vue` (170-190 each) + `components/landing/*` + `admin/LandingConfig.vue` (**1194**).
- **Size**: ~1.9k PHP, ~2.8k v8 (v7 has a single 151-line page), ~1.15k tests, ~20 config keys, 2 tables.
- **Deps**: none. **Rec**: KEEP a minimal version (one hero template, background = random public photo, title/subtitle from config), DEFER the multi-layout picker, link/featured admin CRUD and `LandingConfig.vue`. White-label: CUT (one env flag if wanted).

## 7. Ops, admin and observability features

| Feature | What it does | Where | Size | External | Rec / reason |
|---|---|---|---|---|---|
| Webhooks (031) | Admin-defined outgoing HTTP hooks per event (`photo.add`, `photo.move`, `photo.delete`), method (GET/POST/PUT/PATCH/DELETE), payload JSON or query string, optional secret header, timeout; queued `WebhookDispatchJob`; `lychee:webhook-test`; env flag `WEBHOOK_ENABLED` (default off) | `Models/Webhook`, `Jobs/WebhookDispatchJob`, `Services/Webhook`, `Listeners/WebhookListener`, `Admin/WebhookController`, `Webhooks.vue` | ~1.3k PHP + ~0.5k v8 + 1.7k tests | target endpoints | DEFER; cheap if the app has a domain-event bus (event -> job) |
| Contact form (022) | public form with security question, consent text, privacy URL; admin inbox page; **no email**, messages stored in `contact_messages`; `support:se` | `Contact/ContactController`, `Models/ContactMessage`, `Contact.vue`, `admin/ContactMessages.vue` | ~550 PHP + ~570 v8 | none | CUT |
| Security advisories (032) | `SecurityAdvisoriesService` queries GitHub security-advisories API, `VersionRangeChecker` compares with running version; shown in diagnostics + dismissable login modal | `Services/SecurityAdvisoriesService`, `VersionRangeChecker`, diagnostic pipe, `SecurityAdvisoriesController`, modal | ~415 PHP + ~80 v8 + 520 tests | api.github.com (`ADVISORIES_API_URL`) | CUT (Lychee-specific; use Dependabot) |
| Update check / changelogs (080) | `CheckUpdateAvailability` + `GitHubVersion` (reads `.git`, asks GitHub compare API), `/Version`, `/ChangeLogs` fetches releases.md from LycheeOrg.github.io; `Admin/UpdateStatus` | `Actions/InstallUpdate`, `Metadata/Versions`, `VersionController`, `ChangeLogs.vue` | ~1.1k PHP + ~40 v8 + 840 tests | GitHub + lycheeorg.dev | CUT (Longan ships via its own release channel; show a static version string) |
| Diagnostics page | `GET /Diagnostics{,::info,::space,::config,::permissions}`; **35 check pipes** (PHP ini, GD/Imagick/PDF, exiftool, DB, permissions, config sanity, services reachability, supporter...) + 6 info pipes; `lychee:diagnostics` CLI | `Actions/Diagnostics`, `DiagnosticsController`, `Diagnostics.vue` | ~700 PHP + ~230 v8 + 130 tests | none | KEEP (small): a `/admin/health` listing binaries (vips/exiftool/ffmpeg), DB, storage, queue. Skip the PHP-specific checks |
| Maintenance tasks | `Admin/Maintenance/*`: ~28 invokable controllers each with `check` (GET) and `do` (POST) pairs: Cleaning, DuplicateFinder, FixJobs, FixTree, FlushCache, FlushQueue, FullTree, GenSizeVariants, MissingFileSizes, MissingPalettes, Optimize (DB), StatisticsCheck, BackfillAlbumSizes, RecomputeBuckets, Register (license), 6 face tasks, 3 order tasks. Page `Maintenance.vue` (v8 ~1.9k incl. subcomponents, v7 ~2.3k) | `app/Http/Controllers/Admin/Maintenance` (1716) | ~1.7k PHP + ~1.9k v8 | none | KEEP a tiny subset (regenerate size variants, fix missing sizes/checksums, recompute stats) as CLI commands; CUT the web UI |
| Jobs history page | `JobHistory` model written by queue jobs (status, owner, parent), list `GET /Jobs`, dashboard tile | `Models/JobHistory`, `HasFailedTrait`, `JobsController`, `Jobs.vue` | ~225 PHP + ~230 v8 | queue | KEEP only if upload/import runs in a queue; otherwise DEFER (needed for upload progress UX) |
| Live metrics (079) | `metrics_enabled` counts visit/download/favourite per photo/album; `live_metrics` table feeds a drawer, retention cleanup (`live_metrics_cleanup`); v2 + v3 SoA endpoints; `support:se` | `Actions/Metrics`, `MetricsController`, `Gallery/LiveMetricsListController`, `MetricsListener` | ~1.0k PHP + ~330 v8 | none | CUT (analytics; use access-log tooling) |
| Statistics (004) | per-size-variant and per-album disk usage, photo count over time; precomputed `album_size_statistics` (+ `RecomputeAlbumSizeJob`, `lychee:recompute-album-sizes`); `support:se` | `Actions/Statistics`, `StatisticsController`, `Services` | ~600 PHP + ~160 v8 | none | DEFER (disk usage per album is useful, can be one SQL query) |
| Insights (085) | v8-only page replacing Statistics: shooting activity, devices, focal lengths, image formats, storage, timeline; owner/admin scoped; `echarts`; `support:se` | `Actions/Insights` (accumulators, cached), `InsightsController`, `Insights.vue` | ~820 PHP + ~390 v8 + 1.1k tests | `echarts` | CUT (fluff) |
| Admin dashboard (037) | `/admin` tile grid + cached stats (`AdminStatsService`, 5 min), admin URLs under `/admin/*`, flag `use_admin_dashboard` | `Admin/AdminDashboardController`, `Services/AdminStatsService`, `AdminDashboard.vue` | ~350 PHP + ~250 v8 | none | CUT (a simple settings page is enough) |
| Honeypot / RSS / Log viewer / Telemetry | `HoneyPotController` catch-all that detects scanner paths (`.env`, flagged paths) and falls through to 404; `RSSController` album/photo feeds (`spatie/laravel-feed`); `opcodesio/log-viewer` at `/Logs`; OpenTelemetry `TraceService` (optional, build arg `TELEMETRY`) | various | honeypot ~360, RSS ~370, telemetry ~80 PHP | `spatie/laravel-feed`; OTel extensions | CUT honeypot/log-viewer/telemetry; RSS DEFER |

## 8. Image / media / library features

| Feature | What | Where | Size | External | Rec / reason |
|---|---|---|---|---|---|
| Renamer rules (017) | `renamer_rules` table: regex/replace rules applied to photo/album titles on upload and on demand (preview + apply UI, 017 adds album-hero button); `AutoRenamer` upload pipe; `support:se` | `Metadata/Renamer`, `RenamerController`, `Models/RenamerRule`, `RenamerRules.vue` | ~1.2k-1.4k PHP + ~0.9k v8 + 3.0k tests | none | CUT (power-user fluff; users can bulk-edit titles) |
| Bulk album edit (034) | admin page listing albums in nested-set order, filter by name, multi-select, patch license/visibility/layout/sorting/ownership at once | `Admin/BulkAlbumController`, `BulkAlbumEdit.vue`; also `Photo` bulk license edit (016) | ~1.3k PHP (pattern incl. other bulk) + ~1.5k v8 + 0.2k tests | none | DEFER |
| Duplicates finder | SQL search for photos with same checksum / same title in album / within same album, UI list | `Maintenance/DuplicateFinder`, `Actions/Photo/Pipes/Duplicate`, `DuplicatesFinder.vue` | ~680 PHP + ~320 v8 | none | KEEP duplicate-on-upload detection by checksum (`FindDuplicate` pipe, `skip_duplicates`); DEFER the finder UI |
| Fix-tree | repairs nested-set `_lft/_rgt` (`lychee:fix-tree`, `Maintenance/FixTree`, WASM `@lychee-org/nested-set-checker-wasm` in UI) | `Console/Commands/FixTree`, `Maintenance/FixTree`, `FullTree`, `FixTree.vue` | ~120 PHP + ~330 v8 | wasm | CUT: only needed because of the nested-set album tree. Choose adjacency list + closure/ltree in Longan |
| Tags management | `Tag` model, tag list/edit/rename/merge/delete (`/Tags`, `/Tag`), photo tags, **tag albums** (`TagAlbum`, 050 album tags, 098 tags category, 046 tag cover, 026 album tag filter); `tag-system.md` | `Models/Tag`, `TagController`, `Actions/Tag`, `Models/TagAlbum`, `TagsManagement.vue` | ~1.1k PHP + ~0.3k v8 (more in albums) + large tests (~11k pattern match, overcounts) | none | KEEP plain tags + merge/rename; DEFER tag-album smart albums |
| Sync / import (024) | CLI `lychee:sync {paths*}` (dirs become albums, files imported directly; options `--album_id --owner_id --delete_imported --import_via_symlink --skip_duplicates --delete_missing_photos/albums --dry_run`); **web** "Import from server" browser (`Import`, `Import::browse`, disable via `DISABLE_IMPORT_FROM_SERVER`); `Photo::fromUrl` (`DownloadedFile`, `UrlValidation`); Dropbox chooser key (`dropbox_key`, admin-only, front-end SDK) | `Actions/Import` (1.4k), `Console/Commands/Sync` (362), `Admin/ImportFromServerController`, `Image/Files/DownloadedFile` | ~1.8k PHP + ~0.8k Vue + 1.9k tests | server FS; URL fetch | KEEP the CLI `sync` (power-user ingest, ~1k LOC if simplified); CUT web server-browse (security surface) and Dropbox; DEFER import-from-URL |
| Camera capture (029) | "Take Photo" in add menu: `getUserMedia` -> canvas -> JPEG -> existing upload queue; needs secure context + `Permissions-Policy` header | `CameraCapture.vue` (v8 207, v7 195) | frontend only | browser camera | DEFER (cheap, mobile nicety) |
| Embeds (012) | JS widget (`resources/js/embed`, ~730 LOC, separate Vite config `vite.embed.config.ts`, UMD bundle with inlined WASM justified-layout) rendering album/stream on external sites; public CORS routes `GET /Embed/{album_id}`, `/Embed/stream`, throttled; embed-code generator UI; disabled while global password set | `routes/api_v2_embed.php`, `Gallery/EmbedController`, `Requests/Embed`, `resources/js/embed`, v8 `embed` forms | ~1.1k PHP + ~0.6k v8 + ~0.7k shared + 1.4k tests | CORS | CUT (second frontend bundle) |
| Friendly URLs (019) | optional `slug` on albums/tag albums; `ResolveAlbumSlug` middleware swaps slug -> id before validation | `Middleware/ResolveAlbumSlug`, `Rules/SlugRule`, `BaseAlbumImpl` | ~240 PHP + 1.0k tests | none | KEEP (tiny; nice URLs, one column + resolver) |
| Frame mode (088) | `/frame/{albumId?}` fullscreen random photo refreshed every `mod_frame_refresh`; 088 adds clock + info (title, albums, EXIF) overlays with position/opacity; `GET /Frame` | `Gallery/FrameController`, `Actions/Frame`, `Frame.vue`, `components/frame/*` | ~520 PHP + ~420 v8 + 780 tests | none | DEFER (digital-photo-frame use case; trivial API) |
| 360 photos (082) | detect equirectangular from XMP-GPano (`PanoramaDetector`, `photos.is_360`), in-house WebGL2 sphere renderer (ADR-082-01), `lychee:detect_360` | `Metadata/PanoramaDetector|Info`, v8 viewer (~930 LOC), Detect360 command | ~320 PHP + ~930 v8 + 790 tests | exiftool/XMP | DEFER |
| PDF view (099) / PDF thumbs (038, 081) | PDFs uploaded as photos, thumbnail via Imagick + Ghostscript, `assertPdfPageSizeIsSafe` (configurable MediaBox match limit), photo view embeds the PDF (wheel/dock fixes) | `ImagickHandler`, `AssertSupportedMedia`, `PhotoPanel.vue` | small (~100-200) | Ghostscript, Imagick PDF policy | DEFER |
| Google motion photos (100) | read MotionPhoto 1.0 / Ultra HDR / legacy MicroVideo from JPEG, extract embedded MP4 as live-photo partner; hover video in grid | `Metadata/MotionPhoto*`, `GoogleMotionPictureHandler`, 2 upload pipes, `lychee:extract_motion_photos` | ~460 PHP | `lychee-org/php-exif`, ffmpeg | DEFER (live photo partner model needed first) |
| JPEG XL (101) | accept `.jxl` uploads (kept as original), `size_variant_format` may be `jxl` | Dockerfile (builds ImageMagick 7 from source with libjxl, libheif, libraw, openjp2, webp; ADR-101-01), handlers | ~50 PHP; heavy Docker | Imagick+libjxl | CUT (browser support partial; huge build cost) |
| RAW upload (020) | stores untouched RAW/PSD/HEIC as `RAW` size variant, converts to JPEG for display via Imagick (`Actions/Photo/Convert/RawToJpeg`), download gated | `DetectAndStoreRaw`, `CreateRawSizeVariant`, enum shift (RAW=0), 4 migrations | ~510 PHP (incl. migrations) + 300 tests | Imagick+libraw | DEFER; HEIC support is the realistic must-have, RAW later |
| Watermark (015) | server-side watermark of size variants (position, size, opacity, shift, original/public/logged-in switches), per-upload opt-out toggle, `WatermarkerJob`, retroactive apply (`/Photo::watermark`, SE) | `Image/Watermarker`, `ApplyWatermark` pipe, `Jobs/WatermarkerJob`, `WatermarkPreview.vue` | ~760-1.1k PHP + ~600 v8 + 870 tests | Imagick/GD | DEFER |
| Size variant format (073) | setting `size_variant_format` = `original|jpeg|webp` (+`jxl`), `compression_quality` 0-100 (0 = lossless) | naming strategy + handlers | ~60 PHP | libwebp | KEEP (webp output, trivial in sharp/vips) |
| srcset/sizes (075) | frontend picks `small/small2x/medium/medium2x` via `srcset` + `sizes`; album cover gets 2x descriptor | `AlbumThumbImage.vue`, `PhotoPanel` | frontend only, ~50 | none | KEEP (it is the whole point of generating 2x variants) |
| Zip download (021, 035) | album zip with selectable size variant (021) and chunked multi-part zips (035) | `Services/Zip`, `Services/Archives`, `ZipController` | ~1.4k PHP + 1.2k tests | `maennchen/zipstream-php` | KEEP basic streaming zip with variant choice; CUT chunked |
| Timeline / date scrubber | v8 Timeline views (061-066, 071, 094, 095, 106) and a lot of struct-of-arrays bucketing (`bucket_key`, `taken_key`, `month_day_key`) | `AlbumBucketComputer`, `PhotoBucketComputer`, `Bucket*`, `Recompute*Bucket*Job` x6, `lychee:recompute-buckets` | ~1.8k PHP + ~3.3k Vue | none | DEFER (the bucket precomputation is the perf scaffolding for 100k+ photos; start with keyset pagination) |
| Colour extraction | `league/color-extractor` palette per photo, `ExtractColoursJob`, `lychee:extract_colour_palette` | `Image/ColourExtractor`, `Models/Palette|Colour` | ~940 PHP | none | CUT (used for tinted tiles only) |
| Geodecoding | reverse geocode GPS -> location string via Nominatim (rate limit 1 req/s, `location_decoding_requests_per_second`) or local `lychee-reverse-geo-coding` container | `Metadata/Geodecoder`, `GeodecodeLocationJob`, `lychee:decode_GPS_locations` | ~365 PHP + 700 tests | Nominatim / sidecar | DEFER |
| S3 storage | optional upload of size variants/tracks to S3 (`use-s3`, `UploadSizeVariantToS3Job`, `lychee:s3_migrate`) | `Jobs/Upload*ToS3Job`, `MoveToS3`, flysystem-aws-s3 | ~370 PHP + 340 tests | S3 | DEFER (use a storage-adapter abstraction from day 1) |

## 9. Maps and GPX

- **Map (067, 086)**: Leaflet page `/map[/{albumId}]` with marker clustering; 067 replaces whole-scope fetch by a 2-D **grid bucketing** tier (bounded cost); 086 adds album header style `map` (hero shows Leaflet map of album's geotagged photos, v3 `GET /Map/album`). Providers enum `MapProviders`: OpenStreetMap.org / .de / .fr, RRZE. Size ~1.7k PHP (`Actions/Map`, `Map*Controller`, `MapListingCacheFlushRequested`) + ~1.1k v8 + 0.35k v7 + ~0.4k shared + 1.7k tests. Deps: `leaflet`, `leaflet.markercluster`, `leaflet-rotatedmarker`, tile server. **Rec: KEEP the basic map (photos with GPS -> clustered pins)**, DEFER grid bucketing (add when cluster cost shows) and map header (086).
- **Multi-track / GPX (055)**: `tracks` child table (`id, album_id, name, file_name, disk`) replaces `albums.track_short_path`; upload/delete GPX per album, `GpxValidation` service, `leaflet-gpx` on album map, `lychee:track_s3_migrate`. ~1.1k PHP + ~200 v8 + 1.1k tests. **Rec: DEFER** (niche; hikers/travel).

## 10. Internationalisation

- `lang/`: **23 locales** (ar, bg, cz, de, el, en, es, fa, fr, hu, it, ja, nl, no, pl, pt, ru, sk, sv, tr, vi, zh_CN, zh_TW) = en + 22 translations; ar and fa are RTL. Managed in self-hosted Weblate (`docs/specs/3-reference/localization.md`).
- Each locale has **40 PHP files, ~4.3k lines** (en: 4332; largest `all_settings.php` 1134, `gallery.php` 432); whole directory 99.6k lines. Frontend uses `laravel-vue-i18n` / `vue-i18n` reading the same PHP files (`lang:json` artisan command converts to JSON).
- Many files exist only for peripheral features (`webshop, webhook, renamer, people, moderation, landing_*, contact, insights, statistics, jobs, user-groups, maintenance, duplicate-finder, fix-tree, diagnostics, changelogs, watermark, import_from_server, admin-dashboard, design-system, bulk_album_edit`): each cut feature also drops ~22 translation files.
- **Rec: KEEP i18n infrastructure with en (+ maybe de/fr/nl at first), keys in JSON per namespace; do not copy the 22 locales** (they will drift against the reduced feature set; re-import via Weblate later). `all_settings.php` (1134 lines) is a description for every config key and mostly vanishes with the config table trimming.

## 11. Console commands (`app/Console/Commands`, 3.7k LOC, ~35 commands)

Scheduler (`app/Console/Kernel.php`) has exactly one entry: `lychee:photos_added_notification` weekly (emails new-photo digest; `Mail/PhotosAdded`, `Notifications/PhotoAdded`, the only mail feature). Everything else is manual / Maintenance-page triggered.

| Group | Commands | Matters? |
|---|---|---|
| Ingest | `lychee:sync` (362 LOC; files/dirs, many flags) | KEEP |
| Variants and metadata backfill | `lychee:generate_thumbs {type}`, `lychee:variant_filesize`, `lychee:takedate`, `lychee:exif_lens`, `lychee:video_data`, `lychee:encode_placeholders`, `lychee:extract_colour_palette`, `lychee:detect_360`, `lychee:extract_motion_photos`, `lychee:decode_GPS_locations` | KEEP `generate_thumbs`/`takedate` equivalents (as one `reprocess` command); rest follow their features |
| Integrity | `lychee:fix-tree`, `lychee:fix-permissions`, `lychee:ghostbuster` (dead symlinks, zombie photos), `lychee:recompute-album-sizes`, `lychee:recompute-album-stats`, `lychee:recompute-buckets` | KEEP a `doctor` (zombie photos, stats recompute); CUT fix-tree and bucket commands if design differs |
| Storage | `lychee:s3_migrate`, `lychee:track_s3_migrate` | DEFER |
| Users | `CreateUser`, `UpdateUser` (`UserManagment/`), `lychee:reset_admin` | CUT (Keycloak) |
| AI / webhook | `lychee:scan-faces`, `lychee:rescan-failed-faces`, `lychee:webhook-test` | follow features |
| Ops | `lychee:diagnostics`, `key:generate`, `optimize`, `migrate` (Laravel overrides), `lang:json` | KEEP diagnostics only |
| Worker | queue worker is the stock Laravel `queue:work` started in the `lychee_worker` container (002, `QUEUE_NAMES`, `WORKER_MAX_TIME`) | KEEP concept: separate worker process for thumbnails |

Jobs (`app/Jobs`, 30): image pipeline (`ProcessImageJob`, `ImportImageJob`, `ExtractZip`, `EmbedMetadataJob` writes metadata back into the original/RAW (059), `WatermarkerJob`, `ExtractColoursJob`, `GeodecodeLocationJob`, `FileDeleterJob`), 9 recompute jobs for albums/buckets/stats/thumbs, 6 AI/NSFW, S3 x2, `WebhookDispatchJob`, `RotateLicenseKeyJob`, `CheckTreeState`. The 9 recompute jobs exist purely for precomputed counters; ADR-090 and feature 090 spend effort deduplicating them.

## 12. Docker / deploy footprint

- **Image** (`Dockerfile`, 308 lines; `Dockerfile-legacy` 329): 4 stages: composer, node 26 (`npm ci && npm run build`: two Vite builds incl. the embed bundle), a stage that **compiles ImageMagick 7 from source** (libjxl, libheif, libraw, openjp2, webp; plus PECL imagick against it), and runtime `dunglas/frankenphp:1.13` (php8, trixie; Octane/FrankenPHP worker mode). `docker/scripts/00..05-*.sh` + `entrypoint.sh` do config/env/DB/permission checks; `nginx.conf`, `php-fpm.conf` for the legacy image.
- **Required binaries**: ImageMagick 7 (Imagick), Ghostscript (PDF), `exiftool` (`libimage-exiftool-perl`, optional but preferred reader; some features exiftool-only), `ffmpeg` (video thumbs/metadata via `php-ffmpeg`), `jpegoptim` (`spatie/laravel-image-optimizer`), libheif/libjxl/libraw runtime libs. **No libvips anywhere** (grep: no references). GD is the fallback handler (`GdHandler`).
- **PHP extensions** (composer): bcmath ctype exif fileinfo gd json mbstring openssl pdo tokenizer xml + imagick posix zip; Docker also installs pdo_mysql pdo_pgsql ldap sodium opcache pcntl intl redis; optional opentelemetry + protobuf.
- **DB**: `config/database.php` has `sqlite`, `mysql` (default; MariaDB used in compose), `pgsql`; CI has `phpunit.ci.xml` and `phpunit.pgsql.xml`. 583 migrations (35.8k LOC incl. factories) with many config-seeding data migrations (every setting is a `configs` row inserted by a migration).
- **docker-compose.yaml** (784 lines, heavily commented env reference; `docker-compose.minimal.yaml` 167): `lychee_api`, `lychee_worker`, `lychee_db` (mariadb:11), optional `phpmyadmin`, `lychee_facial_recognition`, `lychee_nsfw_classification`, `lychee_geo_decoding`; volumes `lychee`, `mysql`, `ai_vision_embeddings`, `nsfw_queue`. Hardened: `cap_drop`, `security_opt`, `tmpfs`.
- **Port take-away**: a smaller image is possible: node + `sharp`/libvips + `exiftool-vendored` + ffmpeg, one DB (sqlite default, optional postgres), one worker process; none of the three AI/geo sidecars.

## 13. Testing footprint

- `tests/` 656 `*Test.php` files, ~4.7k test methods, **111.8k LOC** (+ 473k lines of sample fixture data): `Unit` 231 files/31.4k, `Feature_v2` 205/31.3k, `Feature_v3` 76/16.5k, `AssistedVision` 48/10.4k (faces/NSFW sidecar contracts), `Webshop` 29/8.3k, `ImageProcessing` 41/6.0k, `Precomputing` 24/5.4k (the recompute/bucket machinery), `Install` 7, `Traits` 25, `docker` shell tests.
- Features with disproportionate test weight: webshop 8.6k, faces 6.6k, tags/tag albums (~11k pattern-matched), NSFW/moderation 3.8k, renamer 3.0k, LDAP 1.6k.
- Frontend: only **20 `*.test.ts`** unit tests (2.2k LOC; vitest-style files for stores/utils). **Playwright is configured** (`playwright.config.ts`, `@playwright/test` in package.json, `testDir: ./e2e`) but **no `e2e/` directory exists in this checkout**, so there are no e2e specs here. CI workflows in `.github/workflows`. Static analysis: PHPStan (+baseline), Rector, php-cs-fixer, vue-tsc, Oxlint (Vite+).
- Spec-driven process: 102 feature folders x (spec/plan/tasks/open-questions) = 28.8k lines of spec.md alone; ADRs in `docs/specs/6-decisions`. Useful as requirement mining, not for copying.

## 14. Scorecard

LOC = approximate non-test backend PHP + v8 frontend (v7 ignored; tests excluded unless noted).

| Feature | LOC (PHP + v8) | Rec | Reason |
|---|---|---|---|
| SE license gating (`support:*`, `configs.level`) | ~0.6k PHP | CUT | No licensing; ship everything ungated |
| Laravel session login / remember-me / email-login | ~0.4k + 0.3k | CUT | Keycloak OIDC |
| API tokens | ~0.35k | CUT | Keycloak bearer/service accounts |
| OAuth providers (13) | ~0.7k + 0.2k | CUT | one OIDC client instead; keep "provision user on first login" |
| WebAuthn | ~0.5k + 0.6k | CUT | Keycloak passkeys |
| LDAP | ~0.9k | CUT | Keycloak federation |
| Registration + invites + admin setup + installer | ~0.7k + 0.3k | CUT | Keycloak + env bootstrap |
| User management / groups (SE) | ~0.8k + 0.6k / 0.55k + 0.8k | KEEP thin users table / DEFER groups | Need owner id; map groups from claims |
| Global gallery password (074) | ~0.35k + 0.2k | DEFER | Useful but cross-cutting; decide before middleware design |
| Webshop (Stripe/PayPal/Mollie, print/pixel) | ~6.7k + 2.1k (+8.6k tests) | CUT | Out of scope; largest peripheral |
| Faces / people / person albums / quick naming | ~6.8k + 4.2k (+6.6k tests) | DEFER | Needs ML sidecar + shared volume; high value later |
| NSFW + moderation + trust level | ~2.9k + 1.5k | CUT | Public multi-user gallery concern |
| Landing page, 4 layouts + links + featured | ~1.9k + 2.8k | KEEP minimal / DEFER layouts | One hero page is enough |
| White-label (039) | ~100 | CUT | One env flag if ever needed |
| Webhooks (031) | ~1.3k + 0.5k | DEFER | Cheap if event bus exists |
| Contact form (022) | ~0.55k + 0.57k | CUT | SE-gated, no email |
| Security advisories (032) | ~0.4k + 0.1k | CUT | Lychee-project specific |
| Update check / changelogs (080) | ~1.1k + 0.04k | CUT | Own release channel |
| Diagnostics page | ~0.7k + 0.23k | KEEP (small) | Binary/DB/storage health only |
| Maintenance tasks UI | ~1.7k + 1.9k | CUT UI / KEEP few CLI cmds | Regenerate variants, recompute stats |
| Jobs history page | ~0.2k + 0.23k | DEFER | Needed if uploads are queued |
| Live metrics (079) | ~1.0k + 0.33k | CUT | Analytics fluff |
| Statistics (004) | ~0.6k + 0.16k | DEFER | Disk usage per album |
| Insights (085, echarts) | ~0.8k + 0.4k | CUT | Fluff |
| Admin dashboard (037) | ~0.35k + 0.25k | CUT | Fluff |
| Renamer rules (017) | ~1.3k + 0.9k | CUT | Power-user fluff |
| Bulk album edit (034) | ~1.3k + 1.5k | DEFER | Admin convenience |
| Duplicates finder / fix-tree | ~0.7k + 0.3k / 0.1k + 0.3k | DEFER / CUT | Checksum dedupe on upload yes; fix-tree is nested-set only |
| Tags management + tag albums | ~1.1k + 0.3k | KEEP tags / DEFER tag albums | Core organisation |
| `lychee:sync` CLI + import | ~1.8k + 0.8k | KEEP CLI / CUT web server-browse + Dropbox | Ingest from disk is a core workflow |
| Camera capture (029) | 0 + ~0.2k | DEFER | Cheap mobile nicety |
| Embeds widget (012) | ~1.1k + 0.6k + 0.7k shared | CUT | Second bundle |
| Friendly URLs (019) | ~0.24k | KEEP | Tiny |
| Frame mode (088) | ~0.5k + 0.4k | DEFER | Simple later |
| 360 photos (082) | ~0.3k + 0.9k | DEFER | WebGL viewer |
| PDF view (099) | ~0.2k | DEFER | Needs Ghostscript |
| Motion photos (100) | ~0.46k | DEFER | Needs live-photo model |
| JXL (101) | ~0.05k + heavy Docker | CUT | Partial browser support, build cost |
| RAW / HEIC (020) | ~0.5k | DEFER (HEIC early) | HEIC is common from phones |
| Watermark (015) | ~0.8k + 0.6k | DEFER | |
| Size variant format (073) | ~0.06k | KEEP | webp output |
| srcset/sizes (075) | ~0.05k | KEEP | Frontend only |
| Zip download (021/035) | ~1.4k | KEEP basic / CUT chunked | |
| Timeline + scrubber + buckets | ~1.8k + 3.3k | DEFER | Perf scaffolding for huge libraries |
| Colour extraction | ~0.9k | CUT | |
| Geodecoding | ~0.37k | DEFER | |
| S3 | ~0.37k | DEFER | use storage adapter from start |
| Map (067/086) | ~1.7k + 1.1k | KEEP basic / DEFER bucketing + header | |
| GPX multi-track (055) | ~1.1k + 0.2k | DEFER | |
| i18n (22 extra locales, 4.3k lines each) | 99.6k lang lines | KEEP infra, en first | Do not copy locales |
| Honeypot / Log viewer / Telemetry | ~0.45k | CUT | |
| RSS | ~0.37k | DEFER | |
| v7 frontend (legacy PrimeVue) | 38.4k | CUT | Port only the v8 design |
| API v3 SoA vs v2 duplicate surface | ~1.5k routes+controllers | CUT duplication | Design one API |

**Rough totals**: cutting everything marked CUT removes on the order of **25-30k PHP + 12-15k v8 LOC + ~35k test LOC** from what a faithful port would otherwise carry; the DEFER bucket (faces, bucketing, watermark, GPX, 360, bulk edit, webhooks, ...) is another ~25k and can be added incrementally behind the same photo pipeline pipes (`app/Actions/Photo/Pipes/*` is where most media-feature hooks plug in).
