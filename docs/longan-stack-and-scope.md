# Longan: stack and scope proposal

Longan = Lychee's core gallery, re-implemented in TypeScript, v8 UI only, auth delegated to Keycloak, no webshop.
Reference material: `docs/lychee-overview/01..04-*.md` (condensed from Lychee v7.12 / v8 UI, read 2026-11-02).

## 1. Constraints we design for

- Runs unchanged on Node 24+ and Bun. No server build step (Node strips types natively since 24.12; Bun always did).
- Full-stack type safety where the client is derived from the server, not generated from it.
- Minimal dependencies and lines of code. Lychee is ~127k PHP + 62k v8 TS/Vue + 112k tests. Target for Longan v1: ~10k server, ~20k web, ~1.5k shared.
- Auth exists already (Keycloak OIDC). Longan never stores passwords.

## 2. Stack

| Layer | Choice | Why this and not the alternatives |
|---|---|---|
| Runtime | Node 24 LTS and Bun, same sources | Only the entry file differs: `server/node.ts` via `@hono/node-server`, `server/bun.ts` via `Bun.serve`. |
| HTTP | Hono | Runs on both runtimes with one app object. Handles the non-RPC routes: static SPA, `/asset/:album/:photo/:variant` streaming with ETag/304, multipart chunk upload, streamed ZIP, OIDC login/callback. |
| Typed API | oRPC (`@orpc/server`, `@orpc/client`, `@orpc/tanstack-query`) mounted on Hono | Procedures declare zod input and output; the Vue client is `createORPCClient<AppRouter>()`, so the "client for free" requirement is met without codegen. Replaces Lychee's 58 axios service files, `lychee.d.ts` generation, axios-cache-interceptor and hand-typed request payloads. Hono RPC (`hc`) would be one dependency fewer but its type inference degrades past ~100 routes and it has no query-cache integration; tRPC is heavier and awkward with File inputs. |
| Validation | Zod 4 | One schema library for RPC inputs, config values and forms. Shared package exports enums (size variant types, sort columns, licenses). |
| Database | External Postgres (16+) via Drizzle ORM and the `postgres` (postgres.js) driver | Decided: Postgres is assumed to exist (Keycloak needs one anyway). One dialect, one schema, one migration set. No embedded mode. |
| Album tree | `parent_id` + recursive CTE | Drops nested set, `_lft/_rgt`, fix-tree, the WASM tree checker and the insert lock. Ancestor checks for browsability are one CTE. |
| Images | sharp (libvips) | Resize, autorotate, crop thumbs, webp/jpeg output, 16px placeholder. Works on Bun. HEIC needs a libvips with libheif: in Docker install Debian `libvips-dev` and build sharp against it (`SHARP_FORCE_GLOBAL_LIBVIPS=1`). Stock prebuilt sharp has no HEVC decode. |
| Metadata | exifr | Pure JS, no binary, reads EXIF/GPS/XMP from JPEG/HEIC/TIFF/PNG. Add `exiftool-vendored` only when RAW or metadata write-back is wanted. |
| Video | `ffmpeg`/`ffprobe` via `child_process.spawn` | One frame to sharp for thumbs, ffprobe JSON for duration/fps/taken_at. No wrapper library. |
| Upload | One streamed HTTP request per file: `PUT /api/upload` with the raw file body, metadata in headers/query | Decided: standard HTTP streaming instead of Lychee's custom chunk protocol. The body is a web `ReadableStream` piped to a temp file, identical on Node and Bun, no chunk mutex or uuid handshake. Browser sends up to 3 files in parallel with XHR for progress. If resumable uploads are ever needed, add the tus protocol next to it. Reverse proxies must allow large bodies. |
| Jobs | Inline processing in the upload request plus a `jobs` table with an in-process poller | Lychee's default is `QUEUE_CONNECTION=sync` too. sharp handles a 24MP file in well under a second. The poller covers file deletion, reprocessing and the sync importer; a worker mode later is the same loop in a second process. No Redis, no BullMQ, no pg-boss. |
| Auth | Keycloak only. `openid-client` v6 (discovery, PKCE code flow), `jose` (bearer JWT for API/CLI), server-side `sessions` table + signed cookie | See section 2a. LDAP is consumed through Keycloak User Federation, so Longan has no LDAP code. No CSRF layer: SameSite=Lax cookie, JSON POSTs. |
| Frontend | Vue 3.5, Vite, vue-router, Pinia (UI state only), Nuxt UI v4 standalone plugin, Tailwind 4, TanStack Vue Query, `@tanstack/vue-virtual`, vue-i18n (JSON, `en` first), Leaflet lazy-loaded | Lychee v8 already sits on Nuxt UI v4 + Tailwind 4, so its ~50 components port nearly verbatim. Query cache replaces most of the 27 Pinia data stores. Port `@lychee-org/layouts` (justified/masonry/grid/square) to ~150 lines of TS instead of shipping WASM. |
| Tooling | pnpm workspace, TypeScript 5.9, Biome, Vitest, Playwright later | Biome is one tool for lint + format. Vitest runs under both runtimes. |
| Deploy | Docker is the release artifact: one image (`node:24-slim` + Debian `libvips` with HEIF + `ffmpeg`), `docker-compose.yml` with Postgres and Keycloak for a full stack, `docker-compose.dev.yml` with just Postgres + Keycloak for local development | Decided: container to run and release is a must. Lychee's image compiles ImageMagick 7 from source and runs up to three AI sidecars. |

### 2a. Identity: Keycloak and LDAP integration (decided)

- Keycloak is the single identity provider. LDAP/AD users arrive through Keycloak User Federation, which also syncs LDAP groups into Keycloak groups. Longan therefore never binds to LDAP itself; a direct-LDAP mode can be added later only if someone runs Longan without Keycloak.
- Login: OIDC Authorization Code + PKCE through `openid-client`. On callback Longan upserts a `users` row keyed by the token `sub` (username = `preferred_username`, email, display name), stores the roles and groups found in the token, and creates a `sessions` row. The cookie carries only the session id, signed. Logout is RP-initiated (Keycloak `end_session` with `id_token_hint`).
- Roles: realm roles `longan-admin` and `longan-upload` (names configurable by env). Both `realm_access.roles` and `resource_access[client].roles` are checked, so either realm or client roles work. Admin bypasses every album policy; upload allows creating albums and uploading. No other local privilege flags.
- Groups: Keycloak's "group membership" mapper must put full group paths into a `groups` claim. Longan stores them on the user row on every login. In v1 they are visible in the admin user list but not yet share targets; group-based sharing is deferred and will reuse `access_permissions` with a group path column.
- Directory: the sharing picker searches Longan's `users` table first. If the OIDC client has a service account with the `realm-management` `view-users` role, Longan additionally searches the Keycloak Admin REST API (`/admin/realms/{realm}/users?search=`) so albums can be shared with people who have never logged in; the row is pre-provisioned with their `sub`.
- API and CLI: `Authorization: Bearer <access token>` is verified against the realm JWKS with `jose`, same user mapping as the login path. Keycloak service accounts are the replacement for Lychee's API tokens.
- Guests: unauthenticated visitors see public albums unless the `login_required` setting is on.

### Repository layout

```
packages/shared   zod schemas, enums, constants (imported by both sides)
apps/server       hono app, orpc router, drizzle schema + migrations, media pipeline, cli
apps/web          vue app (v8 port)
```

The web package imports `type AppRouter` from the server package. That is the whole type contract.

### API shape

One API generation, modelled on Lychee's v3 struct-of-arrays tiers but without the precompute machinery:

- `albums.children(id)`, `albums.rights(id)`, `albums.head(id)`
- `photos.ratios(albumId)` returns the whole album as column arrays (ids, ratios, bucket ids, flags). At Lychee's measured 7,000 photos this is ~230 KB gzipped, enough for albums well into five figures.
- `photos.details(ids[])` for on-screen tiles and the lightbox, batched by the client.
- Buckets are `date_trunc` groups computed in SQL at read time. No `bucket_key` columns, no recompute jobs, no fix-tree.
- `GET /asset/:album/:photo/:variant` stays a plain Hono route with policy check, `Cache-Control: private, max-age`, `ETag` and 304.

## 3. Scope

### Ship in v1

- Albums: tree, create/rename/describe, move, merge, delete, cover, per-album sort and layout, friendly slug, NSFW flag.
- Photos: streamed upload, sha1 dedup, EXIF, size variants (original, medium, small, thumb, each with optional 2x, placeholder), webp or jpeg output, video thumbs, HEIC, five dominant colours per photo (median cut over a 64px raster from sharp) for tinted tiles and `color:` search.
- Photo edit: title, description, tags, taken_at, license, star rating, highlight, rotate, move/copy (many-to-many `photo_album`), delete with async file cleanup.
- Sharing: public, link-only, password (signed cookie unlock), per-user grants (full photo, download, upload, edit, delete, move), SQL visibility filter shared by every listing.
- Discovery: smart albums (unsorted, recent, highlighted, untagged, on this day, rated), tags with rename/merge, tag albums, search (text, tag, date, type), timeline bucketed by date, basic clustered map.
- Lightbox: custom viewer with pan/zoom, video, slideshow, details sidebar, keyboard shortcuts.
- Download: streamed ZIP with variant choice.
- Admin: trimmed settings page (~40 config keys in a key/value table), theme palette editor (primary and neutral colour choice plus per-shade overrides, stored in config, emitted as `--ui-color-*` CSS variables at runtime, light and dark), health page (vips, ffmpeg, db, storage), user list synced from Keycloak logins with roles and groups.
- CLI: `sync <dir>` importer, `reprocess` variants, `doctor` (orphans, stats).
- UI chrome: v8 "darkroom console" design, light/dark, left slide-over menu, context menus, rubber-band selection, i18n infrastructure with `en`.

### Defer (no hook, keep v1 simple)

Faces/people as a sidecar HTTP contract, Apple live photos and Google motion photos, flow feed, frame mode, date scrubber rail, group-based sharing from Keycloak groups, webhooks, S3 storage adapter. Also deferred: watermarking, global gallery password, reverse geocoding, bulk album edit, disk-usage statistics, duplicates finder UI, camera capture, RSS, additional locales, map grid bucketing.

### Cut

- Webshop: orders, purchasables, print/pixel sizes, Stripe/PayPal/Mollie (~9k LOC + 8.6k tests).
- Supporter Edition licensing and the `configs.level` gate.
- Entire local auth stack: password login, remember-me, email login, registration, invites, admin setup page, installer, API tokens, WebAuthn, LDAP, 13 Socialite providers.
- NSFW classifier, moderation queue, upload trust levels, moderation history.
- Landing page builder, 4 landing templates, white-label.
- Contact form, security advisories, update check, changelogs, live metrics, insights (echarts), admin dashboard, renamer rules, embed widget, Dropbox and import-from-server web UI, JXL, honeypot, log viewer, telemetry.
- GPX tracks, 360 photos, PDF viewing.
- Maintenance web UI (27 tasks), custom CSS/JS injection.
- v7 frontend, v2 API, nested set and fix-tree, managed-cache tag service (rely on `ETag` and per-album `updated_at`).

### Why the cut list is safe for a port

Every cut item is either paid-tier in Lychee, replaced by Keycloak, or an external integration the pipeline only reaches through optional upload pipes. The core pipeline (`Create` pipes, size-variant factory, access-permission filter, SoA listing) has no dependency on any of them.

## 4. Decisions log

1. External Postgres assumed; no embedded database mode.
2. Docker image and compose files are the release artifact.
3. Upload is one streamed HTTP request per file; no custom chunk protocol.
4. Keycloak is the only identity source; LDAP via Keycloak federation; roles `longan-admin`/`longan-upload`; groups stored, group sharing deferred; Keycloak Admin API as optional user directory.
5. `/` is the gallery root. No landing page in v1.
6. Theme palette customization is in v1.
7. GPX, 360 and PDF are cut.
8. Photo colour extraction (dominant palette) is in v1.
