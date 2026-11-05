import type { Hono, MiddlewareHandler } from "hono";
import type { AppEnv } from "../app.ts";

/** Paths owned by the server (API and auth): never answered with the SPA. */
export function isServerPath(path: string): boolean {
	return path === "/api" || path.startsWith("/api/") || path === "/auth" || path.startsWith("/auth/");
}

/**
 * Production static serving of the SPA build: files from `WEB_DIST`, and the index page for every other GET
 * (client-side routes such as `/gallery/<id>` deep links). Unknown `/api` and `/auth` paths get a JSON 404,
 * as does everything when the build has no index.html (API-only image).
 * The runtime-specific `serveStatic` middleware is passed in by node.ts / bun.ts.
 */
export function mountSpa(
	app: Hono<AppEnv>,
	files: MiddlewareHandler,
	index: ((path: string) => string | Promise<string>) | null,
): void {
	app.use("/*", (c, next) => (isServerPath(c.req.path) ? next() : files(c, next)));
	app.get("*", async (c, next) =>
		isServerPath(c.req.path) || !index
			? next()
			: c.html(await index(c.req.path), 200, { "Cache-Control": "no-cache" }),
	);
	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
}
