import { serveStatic } from "hono/bun";
import { createApp } from "./app.ts";
import { env } from "./env.ts";
import { log } from "./lib/log.ts";
import "./routes.ts";
import { startWorker } from "./jobs/worker.ts";

const app = createApp();
if (env.NODE_ENV === "production") {
	app.use("/*", serveStatic({ root: env.WEB_DIST }));
	app.get("*", serveStatic({ root: env.WEB_DIST, path: "index.html" }));
}
startWorker();
log.info(`longan listening on http://localhost:${env.PORT} (bun)`);

export default { port: env.PORT, fetch: app.fetch, maxRequestBodySize: env.UPLOAD_MAX_BYTES };
