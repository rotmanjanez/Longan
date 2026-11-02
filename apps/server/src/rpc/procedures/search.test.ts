import { call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.DATABASE_URL ??= "postgres://longan:longan@localhost:5433/longan";
	process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
	process.env.OIDC_ISSUER ??= "http://localhost:8080/realms/longan";
	process.env.OIDC_CLIENT_ID ??= "longan";
});

import { sql as pg } from "../../db/index.ts";
import { settingBool } from "../../settings/index.ts";
import { router } from "../router.ts";
import { createWorld, type World } from "./gallery.fixtures.ts";
import { tokenize } from "./search.ts";

let w: World;

beforeAll(async () => {
	w = await createWorld();
	await call(router.photos.rate, { id: w.p.p1, rating: 5 }, { context: w.ctx.alice });
});

afterAll(async () => {
	await w?.destroy();
	await pg.end();
});

describe("tokenize", () => {
	it("splits words, modifiers and quoted values", () => {
		expect(tokenize('beach tag:"two words" type:video "free phrase" foo:bar rating:>=3')).toEqual([
			{ key: null, value: "beach" },
			{ key: "tag", value: "two words" },
			{ key: "type", value: "video" },
			{ key: null, value: "free phrase" },
			{ key: null, value: "foo:bar" },
			{ key: "rating", value: ">=3" },
		]);
	});
});

describe("search.photos", () => {
	const search = (term: string, ctx: World["ctx"][keyof World["ctx"]], album?: string) =>
		call(router.search.photos, { term, ...(album ? { album } : {}) }, { context: ctx });

	it("matches free words on title and tags with visibility", async () => {
		const guest = await search(`${w.rand}`, w.ctx.guest);
		expect(new Set(guest.ids)).toEqual(new Set([w.p.p1, w.p.p2, w.p.p3, w.p.p8]));
		const alice = await search(`Sunset ${w.rand}`, w.ctx.alice);
		expect(alice.ids).toEqual([w.p.p1]);
		const byTag = await search(w.tagNames.b, w.ctx.guest);
		expect(byTag.ids).toEqual([w.p.p2]);
		const bob = await search(w.rand, w.ctx.bob);
		expect(bob.ids).toContain(w.p.p5);
		expect(bob.ids).not.toContain(w.p.p4);
	});

	it("supports modifiers", async () => {
		expect((await search(`tag:${w.tagNames.a}`, w.ctx.guest)).ids.sort()).toEqual([w.p.p1, w.p.p2].sort());
		expect((await search(`tag:${w.tagNames.a}`, w.ctx.alice)).ids).toContain(w.p.p4);
		expect((await search(`${w.rand} type:video`, w.ctx.guest)).ids).toEqual([w.p.p8]);
		expect((await search(`date:2023-07`, w.ctx.guest, w.a.pub)).ids).toEqual([w.p.p3]);
		// The album filter covers the subtree (p8 lives in the child album).
		expect((await search(`date:2024`, w.ctx.guest, w.a.pub)).ids).toEqual([w.p.p8, w.p.p1, w.p.p2]);
		expect((await search(`color:#f08a10`, w.ctx.guest, w.a.pub)).ids).toEqual([w.p.p1]);
		expect((await search(`color:#00ff00`, w.ctx.guest, w.a.pub)).ids).toEqual([]);
		expect((await search(`make:canon model:"eos r5"`, w.ctx.guest, w.a.pub)).ids).toEqual([w.p.p1]);
		expect((await search(`license:cc0`, w.ctx.guest, w.a.pub)).ids).toEqual([w.p.p1]);
		expect((await search(`rating:>=4`, w.ctx.guest, w.a.pub)).ids).toEqual([w.p.p1]);
		expect((await search(`rating:<4`, w.ctx.guest, w.a.pub)).ids).toEqual([]);
		await expect(search("type:gif", w.ctx.guest)).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("restricts to an accessible album subtree", async () => {
		const sub = await search(w.rand, w.ctx.guest, w.a.pub);
		expect(new Set(sub.ids)).toEqual(new Set([w.p.p1, w.p.p2, w.p.p3, w.p.p8]));
		await expect(search(w.rand, w.ctx.guest, w.a.priv)).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("caps results", async () => {
		const r = await call(
			router.search.photos,
			{ term: w.rand, album: w.a.pub, limit: 2 },
			{ context: w.ctx.guest },
		);
		expect(r.ids).toHaveLength(2);
		expect(r.isTruncated).toBe(true);
	});

	it("search.albums finds listed albums", async () => {
		const guest = await call(router.search.albums, { term: w.rand }, { context: w.ctx.guest });
		const ids = guest.map((t) => t.id);
		expect(ids).toEqual(expect.arrayContaining([w.a.pub, w.a.child, w.a.pwd, w.a.tagAlbum]));
		expect(ids).not.toContain(w.a.priv);
		expect(ids).not.toContain(w.a.hidden);
		const bob = await call(router.search.albums, { term: `Shared ${w.rand}` }, { context: w.ctx.bob });
		expect(bob.map((t) => t.id)).toEqual([w.a.shared]);
	});
});

describe("map.points", () => {
	it("returns geotagged visible photos with an album context", async () => {
		if (!(await settingBool("features.map", true))) return;
		const r = await call(router.map.points, { album: w.a.pub }, { context: w.ctx.guest });
		expect(r).toEqual({
			ids: [w.p.p1],
			lats: [46.05],
			lngs: [14.5],
			albumIds: [w.a.pub],
			isTruncated: false,
		});
		const all = await call(
			router.map.points,
			{ bounds: { north: 47, south: 45, east: 15, west: 14 } },
			{ context: w.ctx.alice },
		);
		const i = all.ids.indexOf(w.p.p1);
		expect(i).toBeGreaterThanOrEqual(0);
		expect([w.a.pub, w.a.priv]).toContain(all.albumIds[i]);
		const outside = await call(
			router.map.points,
			{ album: w.a.pub, bounds: { north: 10, south: 0, east: 10, west: 0 } },
			{ context: w.ctx.guest },
		);
		expect(outside.ids).toEqual([]);
	});
});
