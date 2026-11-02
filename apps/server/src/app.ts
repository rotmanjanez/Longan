import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { resolveAuth } from "./auth/context.ts";
import { db } from "./db/index.ts";
import { log } from "./lib/log.ts";
import type { Ctx } from "./rpc/context.ts";
import { router } from "./rpc/router.ts";

export type AppEnv = { Variables: { auth: Awaited<ReturnType<typeof resolveAuth>> } };

/** The Hono app shared by the Node and Bun entry points. Static file serving is added per runtime. */
export function createApp() {
	const app = new Hono<AppEnv>();

	app.use("*", async (c, next) => {
		c.set("auth", await resolveAuth(c.req.raw));
		await next();
	});

	app.get("/api/health", (c) => c.json({ ok: true }));

	const rpc = new RPCHandler(router, {
		interceptors: [
			async ({ next }) => {
				try {
					return await next();
				} catch (err) {
					log.error("rpc error", { err: String(err) });
					throw err;
				}
			},
		],
	});
	app.use("/api/rpc/*", async (c, next) => {
		const auth = c.get("auth");
		const context: Ctx = {
			db,
			viewer: auth.viewer,
			user: auth.user,
			sessionId: auth.sessionId,
			requestUrl: new URL(c.req.url),
			resHeaders: new Headers(),
		};
		const { matched, response } = await rpc.handle(c.req.raw, { prefix: "/api/rpc", context });
		if (matched) {
			const res = c.newResponse(response.body, response);
			for (const [k, v] of context.resHeaders) res.headers.append(k, v);
			return res;
		}
		await next();
	});

	// Plain HTTP routes are registered by their modules (auth, asset, upload, zip). See docs/architecture.md.
	registerHttpRoutes(app);

	return app;
}

/** Registry so feature modules can add routes without editing this file. */
const httpRouteRegistrars: Array<(app: Hono<AppEnv>) => void> = [];
export function registerHttpRoutes(app: Hono<AppEnv>) {
	for (const r of httpRouteRegistrars) r(app);
}
export function addHttpRoutes(r: (app: Hono<AppEnv>) => void) {
	httpRouteRegistrars.push(r);
}
