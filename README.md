# Longan

Longan is a small self-hosted photo gallery written in TypeScript. It re-implements the core of
[Lychee](https://github.com/LycheeOrg/Lychee) (albums, sharing, smart albums, lightbox, size variants) with
Lychee's v8 user interface ported to Vue 3 + Nuxt UI, and leaves everything else out. Longan never stores
passwords: all sign-in goes through Keycloak (OIDC), and roles and groups come from the token. The server runs
unchanged on Node.js (>= 22.18, type stripping) and Bun, against an external PostgreSQL.

## Features

- Albums: nested tree, create/rename/describe, move, merge, delete, cover, per-album sorting and layout, slugs, NSFW flag
- Photos and videos: streamed upload, SHA-1 de-duplication, EXIF/GPS, size variants (original, medium, small,
  thumb, each with 2x) in WebP or JPEG, blurred placeholders, video thumbnails (ffmpeg), HEIC import,
  five dominant colours per photo
- Editing: title, description, tags, date, licence, star rating, highlight, rotate, move/copy between albums, delete
- Sharing: public, signed-in-users-only, link-only and password-protected albums (guests unlock per browser session), per-user grants
  (full photo, download, upload, edit, delete, move), user directory from Keycloak
- Discovery: smart albums (unsorted, recent, highlighted, untagged, on this day), tag albums, search
  (`tag:`, `type:`, `date:`, `color:#rrggbb`, `make:`, `model:`, `license:`, `rating:>=n`), timeline, map
- Lightbox: pan/zoom, video playback, slideshow, details panel, keyboard shortcuts
- Downloads: single variants and streamed ZIPs of albums or selections
- Admin: settings, theme palette editor, user list, health page, job queue with regeneration of sizes
- CLI: directory importer, variant regeneration, storage consistency check

## Quick start (Docker Compose)

`docker-compose.yml` starts Longan, PostgreSQL and Keycloak with the development realm imported:

```sh
docker compose up -d --build
```

Open http://localhost:3100 and sign in as `admin`/`admin`, `alice`/`alice` (may upload) or `bob`/`bob`
(no roles). The Keycloak admin console is at http://localhost:8080 (`admin`/`admin`). The compose file pins the
issuer to `http://localhost:8080` for both the browser and the app container (a small `socat` sidecar forwards
`localhost:8080` inside the app container); for anything beyond a local trial put Keycloak and Longan behind real
hostnames, set `SESSION_SECRET`, and replace the client secret.

Prebuilt images are published to the GitHub Container Registry by CI: `ghcr.io/rotmanjanez/longan:edge` tracks
`main`, release tags `vX.Y.Z` publish `X.Y.Z`, `X.Y`, `X` and `latest` (linux/amd64). Use one in place of `build:`
in your own compose file.

The image runs database migrations on start (`docker/entrypoint.sh`, skip with `SKIP_MIGRATIONS=1`) and keeps
originals and variants in the `/data` volume.

### Environment variables

| Variable                       | Default                 | Description                                                                                                |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `development`           | `production` serves the built SPA from `WEB_DIST` and restricts login redirects to `APP_URL`               |
| `PORT`                         | `3000`                  | HTTP port                                                                                                  |
| `APP_URL`                      | `http://localhost:3000` | Public base URL; used for the OIDC redirect URI (`${APP_URL}/auth/callback`) and secure cookies when https |
| `DATABASE_URL`                 | (required)              | PostgreSQL connection string                                                                               |
| `STORAGE_PATH`                 | `./data`                | Originals, variants and temporary uploads                                                                  |
| `SESSION_SECRET`               | (required, >= 32 chars) | Signs session cookies                                                                                      |
| `SESSION_TTL_HOURS`            | `336`                   | Session lifetime                                                                                           |
| `OIDC_ISSUER`                  | (required)              | Issuer URL, e.g. `https://sso.example.com/realms/longan`                                                   |
| `OIDC_CLIENT_ID`               | (required)              | OIDC client id                                                                                             |
| `OIDC_CLIENT_SECRET`           | (none)                  | Client secret (confidential client)                                                                        |
| `OIDC_ADMIN_ROLE`              | `longan-admin`          | Realm or client role that makes a user admin                                                               |
| `OIDC_UPLOAD_ROLE`             | `longan-upload`         | Realm or client role that allows uploading and creating albums                                             |
| `OIDC_GROUPS_CLAIM`            | `groups`                | Token claim with the user's group paths                                                                    |
| `KEYCLOAK_ADMIN_URL`           | (none)                  | Keycloak base URL; enables the user directory for sharing                                                  |
| `UPLOAD_MAX_BYTES`             | `2147483648`            | Maximum size of one uploaded file                                                                          |
| `FFMPEG_PATH` / `FFPROBE_PATH` | `ffmpeg` / `ffprobe`    | Video tools                                                                                                |
| `WEB_DIST`                     | `../web/dist`           | Built SPA (production only)                                                                                |
| `LOG_LEVEL`                    | `info`                  | `debug`, `info`, `warn` or `error`                                                                         |

### API client and integrations

[`@longan/client`](packages/client/README.md) is a typed TypeScript client for integrations such as a photobox:
every RPC procedure, streamed uploads and Keycloak service-account tokens. CI attaches it as a tarball to every
`vX.Y.Z` GitHub release, with the same version as the server image; install it from the release URL:

```sh
npm install https://github.com/rotmanjanez/Longan/releases/download/vX.Y.Z/longan-client-X.Y.Z.tgz
```

## Development

Requirements: Node.js >= 22.18 (see `.node-version`), pnpm (version pinned in `package.json`), Docker.

```sh
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres on :5433, Keycloak on :8080 with the dev realm
cp .env.example apps/server/.env
pnpm db:migrate                                  # migrations + default settings
pnpm dev                                         # API on http://localhost:3100, Vite on http://localhost:5173
```

Use the SPA at http://localhost:5173; Vite proxies `/api` and `/auth` to the server. Dev users are the same as
above (`admin`, `alice`, `bob`, password = username). Run only one side with `pnpm dev:server` or `pnpm dev:web`.

Bun works as an alternative runtime for the server: `pnpm --filter @longan/server start:bun` (runs
`src/bun.ts`; Bun loads `apps/server/.env` itself).

Checks (also run in CI): `pnpm typecheck`, `pnpm lint`, `pnpm test` (server tests use the dev database on port
5433 and clean up after themselves), `pnpm build`. Schema changes: edit `apps/server/src/db/schema.ts`, then
`pnpm db:generate`.

## Architecture

Monorepo with `packages/shared` (zod contract, enums, layout functions), `packages/client` (published API client),
`apps/server` (Hono, oRPC, Drizzle,
sharp, ffmpeg, Keycloak OIDC) and `apps/web` (Vue 3, Nuxt UI, TanStack Query). See
[docs/architecture.md](docs/architecture.md) for conventions, request flow, authorization and the media
pipeline, and [docs/longan-stack-and-scope.md](docs/longan-stack-and-scope.md) for scope and decisions.

## Licence

MIT, see [LICENSE](LICENSE).
