import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { env } from "./env.ts";
import { mountSpa } from "./http/spa.ts";
import { log } from "./lib/log.ts";
import "./routes.ts";
import { startWorker } from "./jobs/worker.ts";

const app = createApp();
if (env.NODE_ENV === "production") {
	mountSpa(app, serveStatic({ root: env.WEB_DIST }), serveStatic({ root: env.WEB_DIST, path: "index.html" }));
}

serve({ fetch: app.fetch, port: env.PORT }, (info) =>
	log.info(`longan listening on http://localhost:${info.port} (node)`),
);
startWorker();
