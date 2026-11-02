# Lychee V8 Frontend Overview (for the "Longan" TypeScript port)

Source: `/tmp/lychee-src/Lychee/resources/js` (Vue 3 + TypeScript SPA, Nuxt UI v4 / Tailwind v4, built with Vite+ `vp`).
All LOC counts are `.ts/.vue/.css` lines, measured with `find | xargs cat | wc -l`.

## 1. Entry / bootstrap / v7-vs-v8 switch

- Server-side switch: `resources/views/vueapp.blade.php` does `@if(Features::active('nuxt_ui'))` then `@vite(['resources/js/app-v8.ts','resources/sass/app-v8.css'])` plus `<x-style/>` (admin-picked palette emitted as `:root{--ui-color-<token>-<shade>:...}`, must come after app-v8.css), else `app.ts` + `app.css` (v7, PrimeVue). `<body class="dark">` is baked in server-side from config `dark_mode_enabled`. Mount point `<div id="app"><app/></div>`.
- `app-v8.ts` (46 lines): `createApp(v8/views/App.vue)` + `pinia` (+`pinia-plugin-persistedstate`) + `vue-router` (`createWebHistory`) + `@nuxt/ui/vue-plugin` + `laravel-vue-i18n` (`i18nVue` with lazy `resolve: resolveLocale`) + `registerIconCollections()` (offline lucide + hand-copied social icons) + `applyStoredDarkModePreference()` + `AxiosConfig.axiosSetUp()`. Imports `sass/app-v8.css`. No global router guards.
- `App.vue` (75 lines): `<UApp><UTheme :props :ui>` wrapping `ConfirmModalHost`, `Error` (global error event overlay), `GalleryUnlock` (when `lycheeStore.is_gallery_locked`, replaces the whole app, login stays reachable), else `LeftMenu` (USlideover nav), `EmbedCodeDialog`, `SpotlightSearch` (UCommandPalette), and `<router-view>` in a fade/translateY `Transition name="lychee-page"`. Also `disableCtrlA()` and `useDocumentTitle()`.
- Routing: shared manifest `router/paths.ts` (54 `{name,path,props?}` entries, component-free) is used by BOTH v7 and v8; `v8/router/routes.ts` (134 lines) maps names to lazy `() => import(...)` components via `componentByName`; unmapped names (only `statistics`) fall back to `Placeholder.vue`. All routes are lazy chunks. Dev-only extra route `/vite/index.html`.
- Per-page bootstrap pattern (no central init): each page's `onMounted`/setup calls `lycheeStore.load()` (`GET Gallery::Init`, big config blob), `userStore.refresh()` (`Auth::user`), `GlobalRights` (`Auth::rights`), `orderManagementStore.refresh()` (webshop basket) etc. `Home.vue` just loads config then redirects to `default_homepage` (gallery | timeline | flow). `Landing.vue` (`/`) fetches `LandingPage`; if disabled redirects to `home`.

### Shared vs v8-specific directories

| Dir | Files / LOC | Used by v8? |
|---|---|---|
| `v8/` | 469 files / 62,044 LOC | the UI. components 301f/33.4k; views 60f/16.8k; composables 56f/6.9k; utils 38f/4.2k; layouts 8f/228; menus 1f/210; router 134; style 37; i18n.ts, icons.ts |
| `stores/` (Pinia) | 27 / 5,092 | yes, shared, but several now import v8 utils (e.g. AlbumState -> `@/v8/utils/adaptPhotoTile`), so effectively v8-driven |
| `services/` (axios wrappers) | 58 / 3,454 | yes, 100% (v8 has one extra: `v8/services` track upload, 32 LOC) |
| `composables/` | 56 / 6,277 | mostly (selection, dragAndSelect, folderDrop, context menus, checkout, slideshow, rating). v7-only leftovers: `useAdminTiles`, `tagsActions`, `contextMenus/leftMenu`, `contextMenuAlbum(s)Add`, `album/treeOperations` (v8 forked its own `v8/composables/album/treeOperations.ts`, etc.) |
| `utils/` | 9 / 954 | yes (Helpers, keybindings-utils, photoView = ImageViewMode logic, detailRequests, sprintf) |
| `config/` | 5 / 713 | yes: `axios-config.ts` (interceptors), `client-cache.ts`, `csrf-getter.ts`, `constants.ts` |
| `layouts/` | 8 / 387 | v7 only, except 3 tiny helpers (`getWidth`, `ratio`, `types`) imported by `v8/layouts/*`. v8 has its own WASM-based `v8/layouts` |
| `router/paths.ts` | 239 | yes |
| `lychee.d.ts` | 2,316 | yes, generated (`scripts/generate-js-types.sh`, runs as `pretypecheck`) from PHP DTOs: namespaces `App.Enum.*`, `App.Http.Resources.*` (incl. `.V3.*` struct-of-arrays) |
| `v7/` | 294 / 38,423 | NO (PrimeVue). Ignore |
| `embed/` | 15 / 2,683 | separate bundle (`vite.embed.config.ts`), not v8 |
| `vendor/webauthn` | 335 | yes (passkey login) |

Convention noted all over v8 code: "fork shared modules rather than editing in place" (v7 stays untouched), so many v8 files are copies of v7 files.

Tests: ~20 Vitest `*.test.ts` files next to modules (jsdom); Playwright e2e in `e2e/`.

## 2. Libraries actually used by v8

package.json deps vs. real v8 imports (counts = v8 files importing):

| Library | Where in v8 | Essential for port? |
|---|---|---|
| `vue` 3.5, `vue-router` 5, `pinia` 4 (+`pinia-plugin-persistedstate`) | everywhere; only `FavouriteState` uses `persist: true` | Yes (framework). Persisted plugin trivial |
| `@nuxt/ui` ^4.12 (Vue-standalone plugin, Reka UI based) | all chrome (see list below) | Yes in the original; for a smaller port could swap component lib, but all markup assumes it |
| `tailwindcss` 4 + `@tailwindcss/vite` + `@tailwindcss/typography` | all styling; `sass/app-v8.css` | Yes |
| `@iconify/vue` + `@iconify-json/lucide` | `UIcon name="lucide:..."`, `PiMiniIcon`; registered offline (`v8/icons.ts`) | Yes (cheap) |
| `@vueuse/core` (26 v8 files), `@vueuse/components` (2) | `useSwipe`, `useElementSize`, `useDebounceFn`, `useKeyModifier`, etc. | Yes (utility) |
| `@tanstack/vue-virtual` (9 files) | `useWindowVirtualizer` in photo/album grids, `useVirtualizer` in upload list | Essential (virtual scroll) |
| `@lychee-org/layouts` (WASM, `v8/layouts/wasmLayouts.ts`) | exports `justified, masonry, grid, square`; signature `(ratios: Float64Array, containerWidth, target, gap) => {containerHeight, boxes[{top,left,width,height}]}` | Essential for layouts; replace by TS implementation or keep WASM |
| `justified-layout` | only v7 + a comment in v8 (replaced by WASM above) | No |
| `leaflet` + `leaflet.markercluster` + `leaflet-gpx` + `leaflet-rotatedmarker` | `views/gallery-panels/Map.vue` (813 LOC), `AlbumMapHeader.vue`, photo-details `MapInclude`; `leafletGlobalPlugin()` in vite.config injects `import L` into plugins; tile provider from `Map::provider` | Optional (Map view, GPX tracks) |
| `echarts` + `vue-echarts` | only `/insights` view (`v8/utils/insights/*`, `components/insights/*`) and statistics | Optional |
| `axios` + `axios-cache-interceptor` | all of `services/*`; cache `id`s per request; switch via `<meta name="lychee-client-cache">` | Yes (axios). Cache optional |
| `laravel-vue-i18n` (+ its vite plugin) | `trans()` / `$t()` in ~185 v8 files | Yes (keys are everywhere; 23 locales) |
| `qrcode` | `ShareAlbum.vue`, `PhotoShareCard.vue`, `webshop/QrCodeLink.vue` | Optional |
| `image-focus` | `HeaderFocusPicker.vue` (album header focal point) | Optional |
| `livephotoskit` | `PhotoBox.vue` (Apple Live Photo playback) | Optional |
| `@lychee-org/nested-set-checker-wasm` | `v8/composables/album/treeOperations.ts` (Fix Tree admin) | Optional (admin) |
| `@lychee-org/zxcvbn-wasm` | `usePasswordStrength.ts` | Optional |
| Dropbox chooser (script tag, `@types/dropbox-chooser`) | `DropBoxChooser.vue`, `DropBox.vue` modal; key from `dropbox_api_key` | Optional |
| `@paypal/paypal-js` | `composables/checkout/usePaypal.ts` | Optional (webshop) |
| `@mollie/api-client` | `useMollie.ts` (Mollie components via script) | Optional (webshop) |
| `@stripe/stripe-js` | in package.json but ZERO imports in v8/shared code | No |
| `@dayflow/blossom-color-picker-vue` | `forms/settings/ColorField.vue` (admin palette) | Optional |
| `vue-collapsed` (8 files) | `<Collapse>` in visibility/sharing forms | Optional (use UCollapsible) |
| `@sidsbrmnn/scrollspy` | one comment in `AllSettings.vue`, replaced in-house | No |
| `tinygesture` | NOT imported anywhere (swipe is `@vueuse useSwipe`) | No |
| `mousetrap` | NOT present. Keyboard shortcuts use Nuxt UI `defineShortcuts` (see 4) | n/a |
| `photoswipe` | NOT present. Lightbox is a custom `PhotoPanel`/`PhotoBox` (see 4) | n/a |
| `primevue`, `@primeuix/themes`, `primeicons`, `@fortawesome`, `tailwindcss-primeui` | v7 only (one stray type import in shared code) | No |
| `sass` | devDependency; v8 has 1 `lang="scss"` block and no .scss; styling is `app-v8.css` | No |
| WebAuthn | vendored `resources/js/vendor/webauthn` | Optional |

Nuxt UI components used in v8 (occurrences): UButton 454, UIcon 308, UFormField 123, UTooltip 111, UInput 89, UModal 69, USelectMenu 65, UCheckbox 63, USwitch 54, UHeader 47, UCard 46, UBadge 44, UTable 20, UAlert 20, UTextarea 16, UInputNumber 14, UKbd 11, UMain 8, UFieldGroup 8, UProgress 7, UNavigationMenu 6, UContextMenu 6, UDropdownMenu 5, UContainer 5, UTabs 4, USlideover 4, USelect 4, UInputMenu 4, URadioGroup 3, UPagination 3, UScrollArea/UPageAside/UEmpty/UCollapsible/UChip 2 each, and 1 each of UTheme, UStepper, USidebar, USeparator, UFooter, UDashboardNavbar, UDashboardGroup (lightbox split layout w/ details panel), UCommandPalette (spotlight), UApp. Composables from Nuxt UI: `useToast` (wrapped by `useAppToast` keeping the old `{severity,summary,detail,life}` shape), `defineShortcuts` (wrapped by `usePanelShortcuts`).

## 3. Routes / views

All routes (name -> path -> view). 54 manifest entries; every one is a lazy chunk.

**Core gallery**
- `home` `/home` -> `Home.vue` (redirector by `default_homepage`)
- `gallery` `/gallery` -> `gallery-panels/Albums.vue` (547): root: smart albums, tag/person albums, pinned, albums, shared albums
- `album` `/gallery/:albumId/:photoId?` -> `gallery-panels/Album.vue` (579) (also serves smart albums `recent`, `starred`, `unsorted`, `on_this_day`, ...). Photo lightbox is NOT a route: it is `photoId` param rendering `PhotoPanel` above the album
- `favourites` `/gallery/favourites` -> `Favourites.vue` (110; client-side favourites, persisted)
- `search` `/search/:albumId?/:photoId?` -> `Search.vue` (688)
- `map` `/map/:albumId?` -> `Map.vue` (813)
- `timeline` `/timeline/:date?/:photoId?` -> `Timeline.vue` (685)
- `flow` `/flow`, `flow-album` `/flow/:albumId/:photoId?` -> `Flow.vue` (413; feed of album cards) and `Album.vue`
- `tag` `/tag/:tagId/:photoId?` -> `Tag.vue` (319)
- `frame` `/frame/:albumId?` -> `Frame.vue` (111; fullscreen photo-frame slideshow with clock/info overlays)

**User**: `login` `/login` (LoginPage 95), `register` `/register` (182), `admin-setup` `/setup-admin` (118), `profile` `/profile` (48, tabs of forms: token, login, 2FA/passkey, oauth, shared-album visibility), `sharing` `/sharing` (262), `permissions` `/permissions` (56), `contact` `/contact` (33), gallery unlock (component, not route).

**Admin** (all under `/admin/*` except where noted): `admin-dashboard` `/admin` (250), `settings` `/admin/settings/:tab?` (241 + 1.9k settings components), `users` `/admin/users` (283), `user-groups` (226), `maintenance` `/admin/maintenance` (77 + 27 task components 1.4k), `jobs` (230), `diagnostics` `/diagnostics` (74), `webhooks` (171), `landing-config` (1,194), `design-system` `/admin/design` (299, palette editor), `watermark-preview` (545), `nsfw-config` (489), `nsfw-findings` (341), `moderation` (309), `contact-messages` (226), `purchasables` (72), `shop-sizes` `/admin/shop/sizes`.

**AI / faces**: `people` `/people` (282), `person` `/people/:personId/:photoId?` (688), `face-clusters` `/people/clusters` (838), `face-quick-naming` `/people/quick-naming` (379), `face-maintenance` `/admin/maintenance/faces` (591); components `FaceOverlay`, `NsfwDetectionOverlay`, self-claim selfie modal.

**Webshop**: `basket` (131), `checkout` `/checkout/:step?` (246; steps one/two/offline, PayPal/Mollie/dummy), `orders` (80), `order` `/order/:orderId?/:transactionId?` (347), plus `PurchasablesList`, `components/webshop` (14 files).

**Landing templates (4)**, selected by `LandingPageResource.layout`: `LandingClassic` (170), `LandingMeridian` (187), `LandingPortfolio` (181), `LandingStudio` (169). Configured in `admin/LandingConfig`.

**Misc**: `tags` `/tags` TagsManagement (156), `renamer-rules` `/renamerRules` (243), `bulk-album-edit` (734), `duplicates` `/duplicatesFinder` (183), `tree` `/fixTree` (277), `changelogs` (39), `insights` (260 + 1.9k echarts), `statistics` (route exists, v8 view = Placeholder).

Left menu (`menus/LeftMenu.vue`, 210) is a USlideover with `UNavigationMenu`; items gated by `GlobalRights` and Lychee feature flags; includes SE (supporter edition) tags on paid features (`SETag`, 15 files reference `is_se_*`).

## 4. Gallery core in detail

### 4.1 Data loading (two code paths, selected by server flag `is_struct_of_array_enabled`)
`stores/AlbumState.ts` (1,066 LOC) is the heart.
1. `Album::head` (`getHead`) -> `Head{Album|TagAlbum|PersonAlbum|SmartAlbum}Resource` + `AlbumConfig` + rights; sets `layoutStore.layout = config.photo_layout`.
2. Legacy/V2 path (flag off): `Album::albums` (paginated) and `Album::photos?page=` (paginated, optional `tag_ids/tag_logic/person_id`), full `PhotoResource` objects, `pagination` + `?page=N` in URL, "background prepend" of earlier pages.
3. V3 "struct-of-arrays" path (flag on; Feature 064-066, 103). Responses are column arrays instead of objects. Three tiers per album, all `GET /api/v3/Albums/{id}/...`:
   - Tier 1 `Photos/buckets` -> `PhotoBucketResource {bucket_ids[], counts[], labels[], bucketable}` (date buckets: day, or hour `Y-m-d-H` 13 chars; `unknown` bucket).
   - Tier 2 `Photos` (ratios) -> `PhotoRatioResource {ids[], titles[], types[], bucket_ids[], ratios[], is_highlighteds[], is_videos[], is_raws[], is_live_photos[], is_360s[], taken_ats[], created_ats[], rating_avgs?, thumb_infos?, tags?...}`; optional scope `bucket_ids[]`, `photo_ids[]`, `limit`.
   - Tier 3 `Photos/details?bucket_id=|photo_ids[]=` (cap 300) -> `PhotoDetailResource` (descriptions, tags, license, checksums, live_photo_urls, panoramas, palette, size_variants, statistics, exif strings...). Fetched lazily for the photos on screen / open in lightbox, deduped by `utils/detailRequests.ts` (`createDetailRequests`).
   - `Photos/urls?photo_ids[]=&density=1|2` -> direct tile URLs `{ids, grid_urls, thumb_urls}`; `TileUrlsState` store resolves/caches them; tile `Thumb.vue` falls back to `/Asset` (blob via axios + MAC) when a direct URL fails or is unavailable.
   - Sub-albums analogous: `Albums/{id}/children` + `AlbumBucketResource`, rights via `AlbumChildrenV3Service.getRights`.
   - `v8/utils/adaptPhotoTile.ts` / `adaptAlbumChildTile.ts` synthesise a `PhotoResource`/`ThumbAlbumResource`-shaped "tile" from the columns (so downstream components are unchanged) and `mergePhotoDetail` upgrades it when tier 3 arrives.
   - Timeline (`TimelineState.ts`, 457) is the same mechanism but windowed per bucket (`ensureBucketsV3`, `requestBucketWindow`, deep link to a date/photo), with placeholder-sized not-yet-loaded buckets. Search v3 (`SearchState.ts`, `services/search-v3-service.ts`) has no bucket tier (flat list).
   - A minimal port can pick ONE path; the V3 path is more complex but needed for huge libraries; V2 is simple paginated JSON.
4. `services/thumb-asset-service.ts` (158): blob fetch + `URL.createObjectURL` cache (max 6000 entries, 1 h TTL, refcounted) for `Asset/...` URLs; temporary-link MAC (`Gallery::getMac`) appended and retried on 401 (`config/axios-config.ts`).

### 4.2 Layouts (square, justified, masonry, grid, list; per-album config)
- Types: `App.Enum.PhotoLayoutType = square | justified | masonry | grid`; plus client-only `list`. Album field `photo_layout` (null = inherit global); `layoutStore.config` (`Gallery::getLayout`) has `photo_layout_justified_row_height`, `photo_layout_square_column_width`, `photo_layout_masonry_column_width`, `photo_layout_grid_column_width`, `photo_layout_gap`. User can switch layout in the header (`PhotoThumbPanelControl`).
- Albums (sub-album tiles) have separate `album_view_mode` (grid | list) and `album_thumb_aspect_ratio` per album (`aspectRatioNumber.ts`), tile width from `albumTileWidth.ts` (287 LOC; breakpoint steps + user-configurable 1/2/3 per row on mobile).
- v8 computes layout analytically with NO DOM: `v8/composables/photo/analyticPhotoLayout.ts` -> `computeBucketLayout(mode, ratios, width, target, gap)` calls the WASM primitive (or a trivial row calc for list), `computePhotoLayout()` concatenates per-bucket runs with `HEADER_ROW_HEIGHT` pseudo-boxes, `buildPhotoChunks()` groups tiles into fixed-count chunks that are the virtualizer's row unit, `computeTimelinePhotoLayout()` caches per bucket. `v8/layouts/use{Square,Justify,Masonry,Grid}.ts` + `PhotoLayout.ts` are the older DOM-writing wrappers (28 LOC each).

### 4.3 Virtual scroll
`components/gallery/albumModule/Virtualized/*` (about 2.7k LOC): `PhotoGridVirtual.vue` (788; unified for album, timeline, search), `PhotoThumbVirtual`, `PhotoListItemVirtual`, `AlbumThumbGridVirtual`, `AlbumListViewVirtual`, `AlbumRootGridVirtual`, and `*PanelVirtual` wrappers. `useWindowVirtualizer` (window scroll, `scrollMargin`, overscan 8 chunks), absolutely positioned chunks with `transform: translate3d`, `contain: layout size`, sticky bucket header ("pinned" label that follows scroll), bucket prefetch margin around visible buckets, `aria-posinset/setsize`. Container width via `useElementSize` on a bounded wrapper (documented ResizeObserver stall for tall elements). Ken-Burns hover zoom (`kenBurnsHover.ts`, `useMotionHover` for live photo/video preview on hover).

### 4.4 Date scrubber (Features 071 / 094 / 095)
`timelineModule/TimelineDatesV3.vue` (510) is a 64px sticky rail: tick labels in the data's unit (year/month/day/hour via `utils/railTicks.ts`, formats from config `date_scrubber_format_{year,month,day,hour}`), fisheye "lens" on hover (`timeline_lens_height/falloff/magnification`), readout pill, drag-to-scrub by pixel offset, binary search bucket<->pixel mapping, playhead sync with scroll. Used by Timeline AND albums (`utils/dateScrubber.ts` 230 LOC derives day entries client-side from tiles; field `photo_date_scrubber_field`: taken_at/created_at/title...; `d` key toggles; per-album override `is_date_scrubber_enabled`).

### 4.5 Selection model, keyboard, rubber band
- `composables/selections/selections.ts` (323): `useSelection(photosStore, albumsStore, togglableStore)` over `selectedPhotosIds` / `selectedAlbumsIds` (stored in `TogglablesStateStore`); click = select, ctrl/meta toggle, shift = range from `lastPhotoClicked`; `selectEverything`, `unselect`, `pruneSelection`; permission-aware via `useAlbumActions().canInteract*`. Touch devices: tap selects when a selection exists.
- `composables/album/dragAndSelect.ts` (568): rubber-band (drag rectangle) selection over absolutely positioned tiles; `data-stop-drag-select` opts rail/controls out.
- Keyboard: Nuxt UI `defineShortcuts` via `v8/composables/usePanelShortcuts.ts` (`definePanelShortcuts`); automatically paused while modals open (store flags). Album.vue bindings: `h` toggle NSFW, `f` fullscreen, `space` slideshow/unselect, `n` new album, `u` upload, `i` info/edit, `l` login, `/` search, `meta_a` select all, `arrowleft/right` prev/next, `o` rotate overlay, `d` date scrubber, `escape` layered close; lightbox adds `z`, `+`/`=`/`-`, `0` zoom, `1`-`5` rating (disabled while zoomed), `v` sphere toggle. `KeybindingsHelp.vue` modal (UTable + UKbd). `utils/keybindings-utils.ts`: `shouldIgnoreKeystroke()` (inputs), `isTouchDevice`, ctrl/meta/shift state via `useKeyModifier`.
- There is NO drag-and-drop for moving photos/albums between albums. Move/merge/copy/delete use dialogs (`MoveDialog`, `AlbumMergeDialog`, `PhotoCopyDialog`, `DeleteDialog`). HTML5 drag is used only for file/folder drop upload and reordering landing links.

### 4.6 Context menu
UContextMenu wraps Albums/Album/Timeline/Search/People panels (`:items="menuSections"`). Items assembled in `composables/contextMenus/contextMenu.ts` (486) as sections, depending on selection (photo vs album vs none), rights and flags: star/unstar, set cover/header, tags, license, rename, copy to, move, delete, download, apply renamer, scan faces, approve (moderation), open in new tab; plus `v8/composables/contextMenus/*` (1,066 LOC) for the "add" menu (upload, import from link/server/Dropbox, new album/tag album/person album, camera capture).

### 4.7 Lightbox / photo viewer (`photoModule/`, 2,074 LOC + drawers)
- Custom, no PhotoSwipe. `PhotoPanel.vue` (238): fullscreen black `UModal` containing `PhotoHeader`, `UDashboardGroup` (resizable/persisted split, `storageKey="photo-panel"`) with `PhotoDetails` drawer (EXIF/details sidebar, 458 LOC, side flips for RTL, map include, links, colour palette, statistics, faces, moderation history), main stage `PhotoBox`, `NextPrevious` thumb buttons (preload ahead 3, behind 1 via `PhotoStore.preloadAround`), `Overlay` (EXIF/date/description overlay, `o` rotates its type), `PhotoRatingOverlay`, `Dock` (action bar: star, set header, rotate CW/CCW, move, delete, live toggle...).
- `PhotoBox.vue` (694): chooses a render mode from `ImageViewMode` (in `utils/photoView.ts`): image (srcset/sizes of medium/original), `<video>` (loop/autoplay config, source swap keyed), PDF `<embed>`, Live Photo (LivePhotosKit player, medium or original, or dock-controlled looping video), 360 sphere (`SphereView` lazy), `FaceOverlay`, NSFW detection overlay. Gestures: `useSwipe` (navigation/swipe-down to go back), wheel navigation (`is_scroll_to_navigate_photos_enabled`), `photo_click_action`, slide transitions (`photoStore.transition`, `disable_swipe_effect`).
- Pan/zoom (Feature 078): `composables/usePanZoom.ts` (435) Pointer Events state machine (tap / pan / pinch / wheel / click-zoom / key zoom), RAF-batched transforms, geometry in `utils/panZoom.ts` (263: clampPan, zoomAround, maxScale from source width), `ZoomMinimap.vue`.
- 360 sphere (Feature 082): `useSphereViewer.ts` (592) WebGL2 canvas + `utils/sphere.ts` / `sphereShader.ts` / `webgl.ts` (equirect + partial-coverage panoramas, drag look, pinch/wheel FOV, texture-size selection, context-loss handling); `isWebGL2Supported()` gate.
- Slideshow: `composables/photo/slideshow.ts` (185) timed (`slideshow_timeout`), `f` fullscreen, `Frame` view reuses a variant (`composables/frame/frameSlideshow`).
- Rating (`useRating`, keys 1-5, `Photo::setRating`), highlight (star), rotate, set header.
- Photo route: `/gallery/:albumId/:photoId`; `composables/photo/photoRoute.ts`/`albumRoute.ts` build route locations; `PhotoStore` (305) holds `photo`, `previous/next ids`, `transition`, zoom/live/sphere controls.

### 4.8 Upload
- `modals/UploadPanel.vue` (305): UModal; drag/drop zone + file picker (+ folder drop: `composables/album/folderDrop.ts` 161, webkit entries, creates albums by folder name up to `folder_upload_max_depth`), `useVirtualizer` over `uploadList` (`utils/uploadList.ts`, pins uploading indexes), `UProgress` totals (completed/errors/warnings), watermark checkbox. `UploadingLine.vue` (257) per file: local thumbnail preview (`utils/uploadThumbnail.ts` with object-URL release), chunked upload: `UploadService.upload` posts `FormData` to `Photo` with `file` (blob slice), `file_name`, `album_id`, `uuid_name`, `extension`, `chunk_number`, `total_chunks`, `apply_watermark`, `file_last_modified_time`; chunk size from `Gallery::getUploadLimits` (`upload_chunk_size`), AbortController cancel, progress via axios `onUploadProgress`. Other sources: `ImportFromLink` (`Photo::fromUrl`), `ImportFromServer` (`Import`, `Import::browse`), `DropBox`, `CameraCapture`.
- `composables/album/uploadEvents.ts` / `v8/composables/album/uploadEvents.ts` (`useMouseEvents`): window-level dragover/drop/paste handlers, gated by `can_upload`.

### 4.9 Album edit drawer (`drawers/AlbumEdit.vue` 349, slide-over with tabs)
Tabs (conditional on rights/type): about (`AlbumProperties.vue`, 722), visibility (`AlbumVisibility`), move (`AlbumMove`), tracks (GPX: `AlbumTracks`), share (`AlbumShare`), shop (`AlbumPurchasable`), danger (`AlbumDelete`), transfer ownership. `AlbumProperties` fields (`UpdateAbumData`): title, slug, description, photo sorting column+order, album sorting column+order, header/cover photo pickers (+ `HeaderFocusPicker`, title colour/position), license, copyright, aspect ratio, photo layout, flow `published_at` (+timezone), album timeline granularity, photo timeline granularity, date scrubber override (inherit/on/off), tags (tag albums: `is_and`), `is_compact`, `is_map_header`, `is_pinned`, expert-mode toggle. Tag and person albums have reduced field sets (`UpdateTagAlbumData`, `UpdatePersonAlbumData`). Endpoints: `Album` PATCH, `Album::header`, `Album::cover`, `Album::updateProtectionPolicy`, `Album::setPinned`, `Album::tags`, `Album::transfer`, `Album::merge`, `Album::move`, `Album::rename`, `Album::watermark`.
### 4.10 Photo edit (`drawers/PhotoEdit.vue` 242 fullscreen UModal + dialogs)
Fields: title, description, tags (`TagsInput`), created_at (datetime-local), taken_at (+modified flag, timezone select), license; separate dialogs for tag (`PhotoTagDialog`), license, copy (`Photo::copy`), move (`Photo::move`), rename, delete, rotate (`Photo::rotate`), highlight (`Photo::highlight`), rating, set cover/header, download (`DownloadPhoto` modal), share card (QR), duplicate, watermark.
### 4.11 Sharing UI
- Per-album `AlbumVisibility` (USwitch cascade): public, full photo access, link required (hidden), downloadable, upload (SE), password-protected (password field), nsfw flag; `ShareAlbum` modal (link + QR), `EmbedCodeDialog`.
- Per-user/group grants: `AlbumShare` + `forms/sharing/ShareLine.vue` checkbox row (read[disabled], full photo, download, upload, edit, move, delete), `SearchTargetUser`/`SearchTargetAlbum`, `AlbumCreateShareDialog`, `ConfirmSharingDialog`. Global `/sharing` view (`Sharing::all`, bulk modal `BulkSharingModal`) and `/permissions` view. Group management in `/admin/user-groups`.
- Unlock password albums: `forms/album/Unlock.vue` (`Album::unlock`); gallery-wide password: `GalleryUnlock` (`Gallery::unlock`).
- Auth: `LoginForm` (`Auth::login`), `LoginModal`, `WebauthnModal` (passkeys), OAuth buttons (`Oauth::providers`), 2FA in profile, API token (`Profile::resetToken`).

### 4.12 Other panels
- Search (`Search.vue`, `forms/search/*`): token/term search (`Search`, `Search::init`, v3 `search-v3-service`), advanced panel (sort column, filters), scoped by album, results shown with same virtual grid; plus global `SpotlightSearch` (UCommandPalette, `v8/composables/spotlight/*` 483 LOC: nav items, albums, gallery actions, language, system actions, remote search).
- Flow (`Flow.vue` + `flowModule` 549 LOC): feed of album cards (`AlbumCardV3`, carousel/top images, `Flow`, `Flow::init`).
- Tags (`TagPanel`), TagFilter/PeopleFilter chips inside albums, `AlbumNavTree/AlbumNavPanel` (collapsible album tree sidebar when SoA enabled), `AlbumHero`/`AlbumHeaderPanel` (cover banner, `album_header_size`, landing-title, Ken-Burns), `SensitiveWarning` (NSFW gate).

## 5. State (Pinia, `resources/js/stores`, plus nothing v8-specific)

No v8-specific stores exist; v8 reuses the shared 27 files. Only `FavouriteState` is persisted.

| Store (file, LOC) | Holds |
|---|---|
| `LycheeState` (395) | Giant config mirror from `Gallery::Init`: `is_init/is_loading`, UI prefs (overlay type, thumb info, date formats, rounding/borders, Ken Burns, download flags per size variant, timeline lens params, minimap, click action, swipe/scroll toggles), feature flags (`is_se_enabled`, `is_pro_enabled`, `is_face_recognition_enabled`, `is_nsfw_classifier_enabled`, `is_struct_of_array_enabled`, `is_timeline_page_enabled`, `is_flow_opt_in_strategy`, `is_registration_enabled`, `is_gallery_locked`, `is_white_label_enabled`...), `title`, `site_logo`, `default_homepage`, `dropbox_api_key`, `are_nsfw_visible`, `nsfw_overlay_mode`, slideshow timeout |
| `UserState` (80) | `user` (`UserResource`, `id === null` = guest), oauth providers; `load/refresh` |
| `GlobalRightsState` (66) | `GlobalRightsResource` (admin/can_edit/upload...), single-flight load keyed by generation |
| `ModalsState` -> `useTogglablesStateStore` (197) | ALL dialog open flags (login, upload, create album/tag/person, edit, rename, move, delete, merge, share, embed, import*, tag, license, copy, renamer, watermark, camera, download*, face assignment), fullscreen, details open, slideshow active, `scroll_memory`, `selectedPhotosIds`, `selectedAlbumsIds`, `list_upload_files`, `upload_config`, `move_album_override` |
| `AlbumState` (1,066) | current album: head resources (model/tag/person/smart), config, rights, password flag, pagination (v2), v3 buckets/boundaries/ratios, `photoDetailsResolvedIds`, tag/person filters, `tags_revision`, album people |
| `PhotosState` (288) | flat `photos[]` (or tiles), `photosTimeline` split by date, rating filter, `photoPageMap` |
| `AlbumsState` (398) | root: smart albums, tag/person/user albums, pinned, shared (split by owner), `rootConfig`, `rootRights`, `selectableAlbums` |
| `AlbumListState` (187) | flat id/title/_lft/_rgt/cover/can_edit columns of all albums (for move target / search pickers / tree), v3 `Albums` |
| `PhotoState` (305) | open photo: id, `photo`, prev/next, transition, image view mode, preload, `ZoomControls`, `LivePhotoControls`, sphere flag |
| `TimelineState` (457) | v3 timeline buckets/ratios/tiles windows, v2 pages |
| `SearchState` (355) | term, config, sort, results (albums, photos v3), pagination |
| `MapState` (239) | map data, provider, selected album |
| `FlowState` (215) | flow cards / pagination |
| `LayoutState` (45) | `config: PhotoLayoutConfig` (column widths/gap), `layout` (justified default), icon class getters |
| `TileUrlsState` (112) | direct tile URL cache, viewer id, epoch |
| `TagState`, `CatalogState` (webshop catalog per album), `OrderManagement` (basket/orders), `ShopManagement`, `PhotoFacesState`, `PhotoNsfwDetectionsState`, `UsersAndGroupsState`, `FavouriteState` (persisted), `NsfwConsentedState`, `ImportState`, `LeftMenuState` (`left_menu_open`) | as named |

## 6. Services layer & types

- `resources/js/services/*.ts` (58 files, 3.4k LOC) = thin axios wrappers; `Constants` gives `/api/v2/` and `/api/v3/` (+`<base href>`). ~240 distinct endpoint paths. Style `Controller::action` (e.g. `Album::head`, `Photo::move`, `Settings::setConfigs`, `Maintenance::flushCache`). Groups: Album (371 LOC), Albums, Photo, Photo/{id}/faces, Search/Search::init, Timeline/Timeline::dates, Flow, Map/Map::provider, Frame, Tags/Tag/TagAlbum/PersonAlbum, Sharing, Profile, Auth(+Oauth, webauthn), Users/UserGroups/UserManagement, Settings, Gallery::* (Init, Footer, getLayout, getMac, getUploadLimits, unlock), Import, Renamer, Diagnostics, Maintenance (many), Jobs, Webhooks, Moderation, NsfwDetection, Face*/People, Landing*, Contact, Metrics, Statistics, Shop/* (Basket, Checkout, Order, Management, Catalogue), BulkAlbumEdit, v3 (`album-list`, `album-children`, `album-category`, `photo-children`, `search`, `map`).
- Types: responses are typed with global namespaces from generated `lychee.d.ts`, e.g. `AxiosResponse<App.Http.Resources.V3.PhotoRatioResource>`, request payloads typed locally (e.g. `UpdateAbumData`). The file is generated by the PHP `typescript-transformer` from DTOs, so a port must either keep the backend contract identical or regenerate.
- axios config (`config/axios-config.ts`): `X-Requested-With`, `X-XSRF-TOKEN` from cookie (`csrf-getter.ts`; rejects the request if cookie expired), response interceptor: dispatches a global `"error"` CustomEvent (rendered by `views/Error.vue`), parses Blob error bodies, 401 -> refresh temp-link MAC & retry once for `Asset/` and `Faces/*/photo/`, 409 conflict retry with exponential backoff (`conflictRetries`), "Gallery password required" -> `gallery_locked` event, session expired handling. `axios-cache-interceptor` is installed via `setUpClientCache` (on unless meta `lychee-client-cache` = "0"); cache entries keyed by explicit `id`, cleared by mutations.
- i18n: `laravel-vue-i18n` + its vite plugin converts `lang/<locale>/*.php` (37 PHP files in `en`, about 4.3k lines) into `lang/php_<locale>.json` at build time; `v8/i18n.ts` globs them and exposes `availableLocales` (23 locales: ar bg cz de el en es fa fr hu it ja nl no pl pt ru sk sv tr vi zh_CN zh_TW), `resolveLocale(lang)` lazily imports one JSON. Keys are namespaced by file (`gallery.album.properties.title`, `dialogs.visibility.public`, `left-menu.login`, `toasts.success`, `all_settings.*`...). Language set via admin config `lang` (`Settings::setConfigs`), `<html dir>` rtl for `ar`/`fa`. `trans()` and `$t()` plus `sprintf` helper for HTML snippets.

## 7. Styling / design

- `DESIGN.md` (188 lines) "The Darkroom Console": calm neutral chrome so photos are the only saturated thing. Primary sky (`#0ea5e9`/dark `#38bdf8`), secondary blue/indigo, neutral slate in light and ZINC in dark (deliberate swap), success green, warning yellow, error red. Closed "flag" hue map for tile badges only: nsfw fuchsia, trophy cyan, person purple, rated orange-500, link orange-400 (`v8/utils/albumBadgeColors.ts`). Font: Libre Franklin (self-hosted woff2, 8 weights, `sass/fonts.css`) + Vazirmatn for ar/fa, Helvetica fallback; no display face; custom tiny sizes `text-2xs`, `text-3xs`. Radii: buttons `rounded-xl`, surface `rounded-lg`, chips `sm`. Elevation: resting `shadow-sm`, raised `shadow-md shadow-black/25` ONLY for photo/album tiles, floating `shadow-lg` for modals/drawers. Layout: no sidebar rail, nav is an off-canvas USlideover; `--ui-header-height: 3.5rem`, `--ui-container: 100%`; dialogs/slide-overs instead of push-down panels. Buttons: ghost-first, then soft, outline, solid (white text forced). Album tile = stack of three covers that fan out on hover. Photo tiles round and blur-placeholder cross-fade (user-configurable rounding/border/selection overlay). Use semantic tokens (`text-muted/toned/highlighted`, `bg-default/elevated/muted`, `border-default`), never raw slate/zinc classes or PrimeVue-era `text-muted-color`.
- Tailwind v4 + Nuxt UI via Vite: `vite.config.ts` `ui({ ui: { colors: { primary: "sky", neutral: "slate" }, card: {variants:{variant:{outline:{root:"ring-0"}}}}, button: { compoundVariants: [{color:"primary", variant:"solid", class:"text-white"}] } } })`; runtime theme in `v8/style/theme.ts` (`UTheme` props/ui: modal close off, progress sm, button `rounded-xl`, slideover body/header borders off, navigation gap 0, checkbox/switch pointer labels, icon inline-block).
- `sass/app-v8.css` (477 lines): `@import tailwindcss; @import "@nuxt/ui"; @plugin typography; @custom-variant dark (&:where(.dark, .dark *))`, leaflet + markercluster css, `bg-noise`, `no-scrollbar`, `bg-toned` utilities, `body{overflow-x:hidden}` (not html, to keep modal scroll lock), `.iconify{display:inline-block}`, plus `--ui-color-{primary,secondary,success,info,warning,error,neutral}-{50..950}` mapped to Tailwind palette vars (overridden at runtime by `<x-style/>` from admin Design System page). Extra custom keyframes (landing intro, zoomIn). 24 v8 components carry a `<style>` block; one `lang="scss"`.
- Theming: light/dark by `.dark` class on `<body>`; server default `dark_mode_enabled`, browser-local override in `localStorage["lychee-dark-mode-override"]` (`useDarkMode.ts`), admin can toggle global (`Settings::setConfigs`). Not Nuxt `useColorMode`.
- Icons: Iconify `lucide:*` registered offline (`@iconify-json/lucide`), 12 hand-copied brand icons under prefix `social`; `FILL_OVERRIDE_CLASS` `[&>path]:fill-current` fakes filled variants. `PiMiniIcon`/`MiniIcon` wrappers (legacy PrimeIcons-name shim). Everything works offline (no CDN).

## 8. Essentials vs Optional (LOC from `wc -l`)

### ESSENTIAL: minimal gallery port (about 25-30k LOC in v8 as written; a rewrite can be far smaller)
| Area | Files | LOC |
|---|---|---|
| Bootstrap: app-v8.ts, router, App.vue, Home, Login, Error, GalleryUnlock | | ~2.2k (incl. Albums/Album/Search views) |
| Root albums + Album + Photo views | `views/gallery-panels/Album.vue` 579, `Albums.vue` 547, `Search.vue` 688, `Tag.vue` 319, `Favourites.vue` 110 | 2.2k |
| Gallery components (album/photo modules, thumbs, virtual grids, hero, nav) | `components/gallery/albumModule`, `photoModule`, `components/thumbs` | 8.7k |
| Layout engine | `v8/layouts` + `analyticPhotoLayout` + `virtualAlbumRows` + `albumTileWidth` + `@lychee-org/layouts` | 1.1k |
| Lightbox: pan/zoom | `usePanZoom` + `utils/panZoom` | 0.7k |
| Photo drawers (edit/details/album edit) | `AlbumEdit`, `PhotoEdit`, `PhotoDetails` | 1.05k |
| Album/photo forms + gallery dialogs (properties, visibility, share, move, rename, delete, merge, tag, license, copy) | `forms/album`, `forms/photo`, `forms/gallery-dialogs` | 4.3k |
| Upload | UploadPanel, UploadingLine, uploadList/thumbnail, uploadEvents, folderDrop | 1.2k |
| Selection, rubber band, context menu | selections 323, dragAndSelect 568, contextMenu(+v8) ~1.7k | 2.6k |
| Headers + LeftMenu | `components/headers`, `menus` | 1.4k |
| Auth: LoginForm, LoginModal, Profile forms, Register | ~1k (rough) | 1k |
| Stores (Lychee, User, GlobalRights, Modals, Album, Photos, Albums, AlbumList, Photo, Layout, TileUrls, Search) | | ~3.5k of 5.1k |
| Services (album, photo, search, auth, init, upload, settings, thumb-asset, sharing, tags...) + axios config | | ~2k of 3.4k + 0.7k |
| Misc shared glue (utils, i18n, icons, theme, css, `useAppToast`, `usePanelShortcuts`, `useDarkMode`) | | ~2k |

Decisions for a minimal port: choose V2 paginated loading OR V3 struct-of-arrays (not both; V3 is the better-performing one and only the 4 layouts + virtualizer need it); keep `@tanstack/vue-virtual` (or equivalent) and a layout function (the WASM `justified/masonry/grid/square` signature is a trivial pure function to re-implement in TS); keep keyboard shortcuts as a thin wrapper; skip Dropbox/camera/import-from-server unless needed.

### OPTIONAL / "fluff" for a minimal port
| Feature | Where | LOC |
|---|---|---|
| Date scrubber rail (timeline + album) | `timelineModule`, `dateScrubber`, `railTicks`, `albumDateScrubber*` | 1.3k |
| Timeline view | `Timeline.vue` + `TimelineState` | 0.7k + 0.5k |
| Map view + GPX tracks | `Map.vue`, `AlbumMapHeader`, leaflet libs | 0.95k |
| 360 sphere (WebGL) | `useSphereViewer`, `utils/sphere*`, `SphereView` | 0.95k |
| Live photo (LivePhotosKit), slideshow, Ken Burns hover, ZoomMinimap | PhotoBox parts, `slideshow.ts`, `kenBurnsHover` | ~0.8k |
| Flow feed | `Flow.vue` + `flowModule` | 0.95k |
| Frame (photo-frame) | `Frame.vue`, `components/frame`, frame composables | 0.3k |
| Face recognition / People | `views/face-recog`, `faceRecog` comps, `FaceOverlay` | 3.4k |
| NSFW classifier + moderation + findings | `NsfwConfig`, `NsfwFindings`, `Moderation`, overlays | ~1.4k |
| Webshop (basket, checkout, orders, purchasables, PayPal/Mollie) | `views/webshop`, `components/webshop`, `composables/checkout`, `forms/shop-management`, `AlbumPurchasable` | 2.9k |
| Landing page + 4 templates + LandingConfig | `views/landing`, `components/landing`, `LandingConfig` | 1.3k + 1.2k |
| Admin: Settings(+fields), Users, UserGroups, Webhooks, Jobs, Maintenance (27 tasks), Diagnostics, Dashboard, DesignSystem, Watermark, ContactMessages | `views/admin`, `components/settings`, `forms/settings`, `maintenance`, `admin`, `diagnostics` | ~5.1k views + 1.9k settings + 1.4k maintenance |
| Insights (echarts) + Statistics + LiveMetrics | `views/Insights`, `components/insights`, `utils/insights`, `statistics`, `drawers/LiveMetrics` | ~2.8k |
| BulkAlbumEdit, DuplicatesFinder, FixTree, TagsManagement, RenamerRules (+Renamer comps), ChangeLogs, Contact | `views/*.vue`, `components/renamer` | ~2.5k |
| SpotlightSearch command palette | `composables/spotlight`, `SpotlightSearch.vue` | 0.7k |
| Sharing admin pages (`/sharing`, `/permissions`, BulkSharing) | | 0.6k |
| Embed code, share card/QR, Dropbox/camera/import | misc modals | ~1k |
| WebAuthn/passkeys, OAuth, 2FA | `vendor/webauthn`, `forms/profile` | ~0.8k |
| Supporter-edition (SE) tags / paywall hints | `SETag` in 15 files | tiny |

Rough split: v8 total 62k LOC; essential gallery core about 28k (45 percent); optional/admin/AI/shop about 34k.

## Quick porting notes
- The UI is tightly coupled to backend resource shapes (`lychee.d.ts`) and `Controller::action` endpoints; keep API compat or regenerate types.
- Config-driven UI: almost every visual behaviour is a `LycheeState` flag from `Gallery::Init`; port the store and the flag list first.
- Keep thumb loading rules (direct URL -> `/Asset` blob fallback -> MAC retry) if you need private/S3 albums.
- Dialogs-over-panels pattern: every tool is `UModal`/`USlideover` controlled by a boolean in the Togglables store; Album.vue is effectively a big dialog host (see its template).
