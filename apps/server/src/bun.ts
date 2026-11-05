import { serveStatic } from "hono/bun";
import { createApp } from "./app.ts";
import { env } from "./env.ts";
import { indexPage } from "./http/preview.ts";
import { mountSpa } from "./http/spa.ts";
import { log } from "./lib/log.ts";
import "./routes.ts";
import { startWorker } from "./jobs/worker.ts";

const app = createApp();
if (env.NODE_ENV === "production") {
	mountSpa(app, serveStatic({ root: env.WEB_DIST }), await indexPage(env.WEB_DIST));
}
startWorker();
log.info(`longan listening on http://localhost:${env.PORT} (bun)`);

export default { port: env.PORT, fetch: app.fetch, maxRequestBodySize: env.UPLOAD_MAX_BYTES };
