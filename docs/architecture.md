# Longan architecture and conventions

Read this before touching code. Scope and decisions: `docs/longan-stack-and-scope.md`. Lychee reference digests: `docs/lychee-overview/`. A read-only Lychee checkout may exist at `/tmp/lychee-src/Lychee` (v8 UI under `resources/js/v8`, shared stores/services under `resources/js/{stores,services,composables}`); port behaviour and markup from it, not PHP.

## Layout and ownership

```
packages/shared/src
  enums.ts            ids, enums (size variants, layouts, sorting, license, smart album ids)
  contract/           oRPC contract: resources.ts (zod resources) + index.ts (procedures)   <- the API source of truth
  layout.ts           pure layout functions (justified/masonry/grid/square), used by web + tests
apps/server/src
  env.ts              validated env (zod). Add new vars here with defaults.
  app.ts              Hono app, auth middleware, oRPC handler at /api/rpc. Do not add routes here.
  routes.ts           side-effect imports of modules that call addHttpRoutes()
  node.ts / bun.ts    runtime entry points (static serving + startWorker)
  db/schema.ts        Drizzle schema (snake_case columns via casing option, camelCase in TS)
  db/seed.ts          default settings rows (key, type DSL, category)
  db/migrate.ts       applies drizzle/ migrations then seeds settings
  settings/           cached settings accessors (settingBool/Int/Str/Json, invalidateSettings)
  policy/index.ts     authorization: Viewer, SQL filters (albumListed/albumAccessible/photoVisible/...), rights builders
  rpc/base.ts         `os` implementer bound to contract + Ctx; rpc/context.ts: Ctx, requireUser/Admin/Upload
  rpc/procedures/*.ts one file per contract namespace; rpc/router.ts merges them
  auth/               OIDC login/callback/logout, sessions, bearer tokens, user upsert, Keycloak directory
  media/              upload pipeline, variants, metadata, video, colours, storage paths
  http/               plain routes: asset.ts, upload.ts, zip.ts
  jobs/               jobs table worker + job handlers
  cli/                `node src/cli/index.ts <command>`: sync, reprocess, doctor
apps/web/src          Vue 3 SPA (see "Web")
docker/               Dockerfile, keycloak dev realm, entrypoint
```

Module owners add files inside their directory and their `rpc/procedures/<ns>.ts` file. Cross-module needs go through exported functions, not by editing another module's files. If you must touch a shared file (`schema.ts`, `env.ts`, `seed.ts`, `routes.ts`, contract), keep the change minimal and additive, and note it in your final report.

## Conventions

- TypeScript runs unmodified on Node (>=22.18, type stripping) and Bun. Therefore: erasable syntax only (no `enum`, no parameter properties, no namespaces), `import type` for types, relative imports with the `.ts` extension. `tsconfig` enforces this (`erasableSyntaxOnly`, `verbatimModuleSyntax`).
- Use `node:` built-ins (`node:fs/promises`, `node:crypto`, `node:child_process`, `node:stream`); Bun implements them. Do not use Bun-only or Node-only APIs in shared code. At the HTTP boundary use Web streams (`c.req.raw.body`, `Response`), convert with `Readable.fromWeb` / `Readable.toWeb` when touching files.
- Formatting: Biome, tabs, double quotes, 110 cols. Run `pnpm lint` before finishing. `pnpm typecheck` must pass for the packages you touched.
- Validation: zod from `@longan/shared`. Procedures never re-validate; the contract does.
- Errors in procedures: `throw new ORPCError("NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | "BAD_REQUEST" | "CONFLICT" | "PASSWORD_REQUIRED")`. Plain routes return JSON `{ error: { code, message } }` with the matching status.
- Ids: `newId()` from `lib/ids.ts` (24-char base64url). Timestamps cross the API as ISO strings; schema timestamps use `mode: "string"`.
- Logging: `lib/log.ts`. No `console.log` in library code.
- Settings: read via `settings/index.ts`; never query the table directly outside `settings/` and the settings procedures. New keys go into `db/seed.ts`.
- DB access: `db` from `db/index.ts` (or `ctx.db` in procedures). Prefer the query builder; raw `sql` fragments are fine for listings. Multi-step writes use `db.transaction`.
- Tests: Vitest, files next to code as `*.test.ts`. Tests needing Postgres read `DATABASE_URL` (dev compose on port 5433) and must clean up what they create. Pure logic should be unit-tested without a DB.
- Do not commit. The orchestrator commits per module.

## Request flow

1. `app.ts` middleware calls `resolveAuth(request)` (auth module) which returns `{ viewer, user, sessionId }`. `Viewer` is `{ userId, isAdmin, mayUpload, unlockedAlbumIds }`; anonymous = `GUEST`.
2. `/api/rpc/*` goes to oRPC with `Ctx = { db, viewer, user, sessionId, requestUrl }`. The web client calls `POST /api/rpc/<ns>/<proc>`.
3. Everything else is a plain Hono route registered by a module through `addHttpRoutes((app) => { ... })` and listed in `routes.ts`.

## Authorization rules (policy/index.ts)

- Admin bypasses all. Owner has all rights on own albums/photos.
- `access_permissions` rows: `user_id NULL` = public grant (with `is_link_required`, `password_hash`, and the public-meaningful grants full-photo/download/upload). `user_id` set = share with that user (all `grants_*`). Per-user row wins over the public row. Not inherited; creating a child album copies the parent's rows when `albums.default_protection = inherit`.
- Listing filter: `albumListed(viewer)`; direct access: `albumAccessible(viewer)` (password-protected albums need `albums.unlock` first, which adds the id to `sessions.unlocked_album_ids`; unlocking one album unlocks all albums sharing the same password hash).
- Photos: `photoVisible(viewer)` = owner or in any accessible album. Grants via `photoGrant(viewer, grant)`.
- Smart albums (`unsorted`, `recent`, `highlighted`, `untagged`, `on_this_day`, `timeline`): photo set = smart condition AND `photoVisible(viewer)`; `unsorted` = photos with no album row, owner/admin only. Anonymous visitors see smart albums only when `smart.public` is on; `timeline` additionally needs `features.timeline_public`.
- NSFW: albums have `is_nsfw`; the UI blurs/warns. Smart albums and search exclude photos whose every containing album is recursive-NSFW unless `nsfw.visible_by_default` (use `albumRecursiveNsfw`).

## HTTP routes (plain Hono)

| Route | Module | Behaviour |
|---|---|---|
| `GET /auth/login?redirect=/path` | auth | Start OIDC code flow (PKCE). |
| `GET /auth/callback` | auth | Exchange code, upsert user, create session, set cookie `longan_session` (httpOnly, SameSite=Lax, Secure when APP_URL is https), redirect. |
| `POST /auth/logout` | auth | Delete session, clear cookie, redirect to Keycloak end-session with `id_token_hint` and `post_logout_redirect_uri=APP_URL`. |
| `GET /api/asset/:album/:photo/:variant` | http/asset | `album` is an album id, a smart album id, or `unsorted`. Resolve the photo, check `photoVisible`; `medium*`/`original` additionally need `photoGrant(fullPhoto)` (thumb-class variants: thumb, thumb2x, small, small2x are always allowed once visible). Fallback chain when a variant is missing: medium2x->medium->small2x->small->thumb2x->thumb. Headers: `Cache-Control: private, max-age=3600`, `ETag` (path+mtime+size), `Last-Modified`, 304 on match, `Accept-Ranges` + range requests for `original` (video playback), `Content-Disposition: attachment` when `?download=1` (needs download grant unless owner). |
| `PUT /api/upload?album=<albumId or empty>&name=<filename>&mtime=<ms>` | http/upload | Raw file body. Requires a logged-in user with `mayUpload`, or album `grantsUpload`. Streams to `STORAGE_PATH/tmp/<random>`, runs the pipeline, returns `{ status: "created"|"duplicate"|"skipped"|"error", photoId?, message? }`. Enforce `UPLOAD_MAX_BYTES` via Content-Length. |
| `GET /api/zip?albums=a,b&photos=x,y&variant=original` | http/zip | Streamed ZIP (yazl). Albums recurse with folder structure. Needs download grant per item; silently skips what the viewer may not download. |

Asset URL helper (web): `/api/asset/${albumCtx}/${photoId}/${variant}`.

## Media pipeline (media/)

Storage layout: `STORAGE_PATH/<variant>/<xx>/<yy>/<28 hex>.<ext>`; all variants of one photo share the same random stem. Originals keep their extension (HEIC is converted to JPEG for the original, original bytes are not kept; `original_checksum` is the sha1 of the uploaded bytes). Generated variants use `image.format` (webp or jpeg). Placeholder = 16px webp base64 on `photos.placeholder`.

Pipeline for one file (`media/pipeline.ts`): sniff type (magic bytes, extension) -> sha1 of uploaded bytes -> duplicate check on `photos.original_checksum`/`checksum` (when `upload.skip_duplicates`: if the duplicate exists, link it into the target album and return `duplicate`) -> metadata (exifr: taken_at with original tz, make/model/lens/iso/aperture/shutter/focal, GPS, orientation; ffprobe for video: duration, fps, dimensions, creation_time) -> place original -> sharp variants (autorotate, longest-edge for medium/small, centre-crop square for thumb, 2x only when the source is large enough) -> colours (5 dominant via median cut on a 64px raster) -> placeholder -> insert photo + variants + album link in one transaction. Videos: ffmpeg extracts one frame (first/middle per `upload.video_thumb_at`) which feeds the same variant factory; the original is served with range support. Title = filename without extension. `taken_at` null when unknown. Failures of a single variant are logged, not fatal; a failing pipeline leaves no rows and removes files.

Deletion: remove rows in a transaction, then enqueue a `delete_files` job with the paths. Rotate: rotate the original with sharp and regenerate variants (same paths). Reprocess job: regenerate selected variants.

Jobs (`jobs/`): table `jobs(type, payload, status, attempts, run_at)`. `startWorker()` polls every 2 s with `FOR UPDATE SKIP LOCKED`, runs handlers from a registry (`registerJob(type, handler)`), 3 attempts with backoff, marks failed. Handlers: `delete_files`, `reprocess_photo`, `sync_import` (optional). Keep it under ~150 lines.

## Auth (auth/)

- `openid-client` v6: discovery from `OIDC_ISSUER`, client `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`, PKCE, redirect `${APP_URL}/auth/callback`. State and verifier in a short-lived signed cookie.
- Claims: `sub`, `preferred_username`, `name`/`given_name`+`family_name`, `email`, roles from `realm_access.roles` and `resource_access[client_id].roles`, groups from `OIDC_GROUPS_CLAIM` (array of paths). `isAdmin = roles.includes(OIDC_ADMIN_ROLE)`, `mayUpload = isAdmin || roles.includes(OIDC_UPLOAD_ROLE)`. Upsert `users` by `sub` on every login (refresh username/display/email/roles/groups/lastLoginAt).
- Sessions: `sessions` row, cookie `longan_session=<id>` signed with `SESSION_SECRET` (Hono `getSignedCookie`/`setSignedCookie`), TTL `SESSION_TTL_HOURS`. `resolveAuth` loads the session+user and builds the Viewer. Expired sessions are deleted lazily.
- Bearer: `Authorization: Bearer <jwt>` verified with `jose` `createRemoteJWKSet` against the issuer's JWKS (audience/azp = client id, or accept any when `aud` absent as Keycloak does by default); same claim mapping, user upserted, no session.
- Directory: `users.search` searches local users; if `KEYCLOAK_ADMIN_URL` is set, obtains a client-credentials token (same client, service account enabled) and queries `GET {KEYCLOAK_ADMIN_URL}/admin/realms/{realm}/users?search=&max=20` (realm parsed from the issuer URL), merging results; selecting a directory-only user pre-provisions a local row (`sharing.add` receives local ids, so provide `users.search` results already provisioned, i.e. upsert on search hit).
- Dev realm (`docker/keycloak/realm-longan.json`, imported by `docker-compose.dev.yml`): realm `longan`; confidential client `longan`, secret `longan-dev-secret`, redirect URIs `http://localhost:3100/*` and `http://localhost:5173/*`, web origins `+`, service account enabled with `realm-management/view-users`; realm roles `longan-admin`, `longan-upload`; protocol mapper "groups" (group membership, full path, in access + id token + userinfo); groups `/family`, `/friends`; users `admin`/`admin` (both roles, group family), `alice`/`alice` (upload, group family), `bob`/`bob` (no roles, group friends). Passwords non-temporary.

## Web (apps/web)

- Vite dev server on 5173 proxies `/api` and `/auth` to `http://localhost:3100` (`changeOrigin`, and for `/auth` the Keycloak redirect comes back to 5173 only if that URI is in the client config; it is). Production: the server serves `apps/web/dist`.
- Client: `createORPCClient<ContractRouterClient<typeof contract>>(new RPCLink({ url: "/api/rpc" }))` from `@orpc/client` + `@orpc/contract`; query utils `createTanstackQueryUtils(client)` from `@orpc/tanstack-query`; `@tanstack/vue-query` `QueryClient` with `staleTime` 30 s. Mutations invalidate the affected album/photo queries.
- State: Pinia only for UI state (selection, open dialogs, dark mode, layout choice, upload queue). Server data lives in the query cache.
- UI: Nuxt UI v4 via `@nuxt/ui/vite` + `@nuxt/ui/vue-plugin`, Tailwind 4, icons `lucide:*` (`@iconify-json/lucide`). Theme: `ui({ ui: { colors: { primary: "sky", neutral: "slate" } } })` at build time; at runtime `init.get().config.theme` is applied by setting `--ui-color-primary-*` / `--ui-color-neutral-*` CSS variables on `:root` (map Tailwind palette values; overrides win). Dark mode = `.dark` on `<html>`, default from config, user override in localStorage.
- Design: follow Lychee `DESIGN.md` ("darkroom console"): neutral slate/zinc chrome, sky accent only for focus/active/one primary action, ghost-first buttons, dialogs and slide-overs instead of push-down panels, photo tiles rounded with soft shadow, lightbox true black. Semantic tokens (`text-muted`, `bg-elevated`), no raw palette classes.
- Routes: `/` root albums, `/gallery/:albumId/:photoId?` album (+lightbox via photoId), `/search`, `/map/:albumId?`, `/timeline/:photoId?`, `/tags`, `/sharing`, `/admin/settings`, `/admin/users`, `/admin/health`, `/admin/jobs`, `/login` (redirects to `/auth/login`), `/unlock/:albumId` is a dialog not a route.
- Gallery grid: `photos.ratios` + `photos.buckets` -> layout boxes via `@longan/shared` layout functions grouped per bucket with a 40 px header row -> `@tanstack/vue-virtual` `useWindowVirtualizer` over row chunks -> `photos.details` fetched in batches of up to 300 for mounted tiles (lightbox, overlays). Tile `<img>` uses `srcset` thumb/thumb2x (square layout) or small/small2x (others), tinted background from `colours[i]` until loaded.
- i18n: `vue-i18n`, `src/i18n/en.json` namespaced like Lychee (`gallery.*`, `dialogs.*`, `settings.*`). All user-facing strings go through `t()`.

## Docker

`docker/Dockerfile`: multi-stage. Build stage installs with pnpm and runs `vite build`. Runtime: `node:24-bookworm-slim` + `ffmpeg` + `libheif-examples`; sharp uses its bundled libvips (sharp 0.35 needs libvips 8.18, newer than any Debian package), and HEVC-coded HEIC (iPhone) is decoded through `heif-convert` as a fallback in the pipeline; non-root user; `STORAGE_PATH=/data` volume; entrypoint runs migrations then `node apps/server/src/node.ts`. `docker-compose.yml` = app + Postgres + Keycloak (realm import) for a full stack; `docker-compose.dev.yml` = Postgres + Keycloak only.
