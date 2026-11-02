import type { Hono, MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.ts";

/** Paths owned by the server (API and auth): never answered with the SPA. */
export function isServerPath(path: string): boolean {
	return path === "/api" || path.startsWith("/api/") || path === "/auth" || path.startsWith("/auth/");
}

/**
 * Production static serving of the SPA build: files from `WEB_DIST`, and `index.html` for every other GET
 * (client-side routes such as `/gallery/<id>` deep links). Unknown `/api` and `/auth` paths get a JSON 404.
 * The runtime-specific `serveStatic` middlewares are passed in by node.ts / bun.ts.
 */
export function mountSpa(app: Hono<AppEnv>, files: MiddlewareHandler, index: MiddlewareHandler): void {
	app.use("/*", (c, next) => (isServerPath(c.req.path) ? next() : files(c, next)));
	app.get("*", (c, next) => (isServerPath(c.req.path) ? next() : index(c, next)));
	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
}
