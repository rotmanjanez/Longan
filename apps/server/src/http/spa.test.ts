import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../app.ts";
import { isServerPath, mountSpa } from "./spa.ts";

describe("SPA fallback", () => {
	const app = new Hono<AppEnv>();
	app.get("/api/health", (c) => c.json({ ok: true }));
	mountSpa(
		app,
		async (c, next) => (c.req.path === "/assets/app.js" ? c.text("js") : next()),
		async (c) => c.html("<!doctype html><title>index</title>"),
	);

	it("classifies server paths", () => {
		expect(isServerPath("/api/rpc/init/get")).toBe(true);
		expect(isServerPath("/auth/login")).toBe(true);
		expect(isServerPath("/apiary")).toBe(false);
		expect(isServerPath("/gallery/x")).toBe(false);
	});

	it("serves files, index.html for deep links and JSON 404 for unknown api paths", async () => {
		expect(await (await app.request("/assets/app.js")).text()).toBe("js");
		const deep = await app.request("/gallery/AbCdEfGhIjKlMnOpQrStUvWx/photo");
		expect(deep.status).toBe(200);
		expect(await deep.text()).toContain("<title>index</title>");
		expect((await app.request("/api/health")).status).toBe(200);
		const api = await app.request("/api/nope");
		expect(api.status).toBe(404);
		expect(await api.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
		expect((await app.request("/auth/nope")).status).toBe(404);
	});
});
