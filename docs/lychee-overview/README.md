# Lychee overview (source digest for the Longan port)

Condensed from a read-only clone of https://github.com/LycheeOrg/Lychee at commit 316d921b (v7.12.0, 2026-11-02).

| File | Covers |
|---|---|
| `01-domain-model.md` | 40 Eloquent models, class-table album inheritance, nested set, size variants and storage layout, access-permission model and listing filters, final schema, config table, minimal schema recommendation |
| `02-backend-api-and-pipeline.md` | All v2/v3 routes grouped by domain, struct-of-arrays listing tiers, `/Asset` endpoint, request/DTO/type generation, chunked upload and `Create` pipeline, EXIF/variants/video/RAW, album operations, auth stack, caching, essentials vs optional |
| `03-frontend-v8.md` | v8 bootstrap, libraries actually used, every route, gallery core (SoA loading, layouts, virtual scroll, scrubber, selection, lightbox, upload, edit drawers, sharing UI), Pinia stores, services, design system, essentials vs optional with LOC |
| `04-peripheral-features.md` | SE gating, auth, webshop, AI vision, landing, ops features, media features, maps, i18n, CLI, Docker, tests, keep/defer/cut scorecard |

The stack and scope proposal built on these is in `../longan-stack-and-scope.md`.
