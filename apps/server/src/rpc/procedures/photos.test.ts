import { call } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.DATABASE_URL ??= "postgres://longan:longan@localhost:5433/longan";
	process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
	process.env.OIDC_ISSUER ??= "http://localhost:8080/realms/longan";
	process.env.OIDC_CLIENT_ID ??= "longan";
});

import { db, sql as pg } from "../../db/index.ts";
import { photoAlbum, photos as photosTable } from "../../db/schema.ts";
import { settingBool } from "../../settings/index.ts";
import { router } from "../router.ts";
import { createWorld, type World } from "./gallery.fixtures.ts";
import { bucketLabel } from "./photo-scope.ts";

let w: World;

beforeAll(async () => {
	w = await createWorld();
	// Deterministic order for the public album: newest capture first.
	await call(
		router.albums.update,
		{ id: w.a.pub, patch: { photoSorting: { col: "taken_at", order: "desc" } } },
		{ context: w.ctx.alice },
	);
});

afterAll(async () => {
	await w?.destroy();
	await pg.end();
});

describe("bucket labels", () => {
	it("renders english labels", () => {
		expect(bucketLabel("2024")).toBe("2024");
		expect(bucketLabel("2024-03")).toBe("March 2024");
		expect(bucketLabel("2024-03-05")).toBe("5 March 2024");
		expect(bucketLabel("all")).toBe("");
	});
});

describe("photos.ratios / buckets", () => {
	it("lists an album in sort order with month buckets", async () => {
		const r = await call(router.photos.ratios, { album: w.a.pub }, { context: w.ctx.guest });
		expect(r.ids).toEqual([w.p.p1, w.p.p2, w.p.p3]);
		expect(r.bucketIds).toEqual(["2024-03", "2024-03", "2023-07"]);
		expect(r.ratios[0]).toBeCloseTo(1.5);
		expect(r.ratios[1]).toBeCloseTo(2 / 3);
		expect(r.colours[0]).toBe("#ff8800");
		expect(r.takenAts[0]).toBe("2024-03-15T10:00:00.000Z");
		expect(r.isTruncated).toBe(false);

		const b = await call(router.photos.buckets, { album: w.a.pub }, { context: w.ctx.guest });
		expect(b).toEqual({ ids: ["2024-03", "2023-07"], counts: [2, 1], labels: ["March 2024", "July 2023"] });

		const y = await call(
			router.photos.buckets,
			{ album: w.a.pub, granularity: "year" },
			{ context: w.ctx.guest },
		);
		expect(y.ids).toEqual(["2024", "2023"]);
		const d = await call(
			router.photos.buckets,
			{ album: w.a.pub, granularity: "day" },
			{ context: w.ctx.guest },
		);
		expect(d.labels).toEqual(["15 March 2024", "1 March 2024", "4 July 2023"]);
	});

	it("restricts to buckets or ids", async () => {
		const r = await call(
			router.photos.ratios,
			{ album: w.a.pub, bucketIds: ["2023-07"] },
			{ context: w.ctx.guest },
		);
		expect(r.ids).toEqual([w.p.p3]);
		const s = await call(
			router.photos.ratios,
			{ album: w.a.pub, ids: [w.p.p2, w.p.p4] },
			{ context: w.ctx.alice },
		);
		expect(s.ids).toEqual([w.p.p2]);
	});

	it("uses a single bucket for non-date sorts", async () => {
		await call(
			router.albums.update,
			{ id: w.a.child, patch: { photoSorting: { col: "title", order: "asc" } } },
			{ context: w.ctx.alice },
		);
		const b = await call(router.photos.buckets, { album: w.a.child }, { context: w.ctx.guest });
		expect(b).toEqual({ ids: ["all"], counts: [1], labels: [""] });
		const r = await call(router.photos.ratios, { album: w.a.child }, { context: w.ctx.guest });
		expect(r.bucketIds).toEqual(["all"]);
		expect(r.types).toEqual(["video"]);
	});

	it("enforces album access", async () => {
		await expect(
			call(router.photos.ratios, { album: w.a.priv }, { context: w.ctx.guest }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			call(router.photos.ratios, { album: w.a.pwd }, { context: w.ctx.bob }),
		).rejects.toMatchObject({
			code: "PASSWORD_REQUIRED",
		});
		const shared = await call(router.photos.ratios, { album: w.a.shared }, { context: w.ctx.bob });
		expect(shared.ids).toEqual([w.p.p5]);
	});

	it("tag albums show visible tagged photos", async () => {
		const guest = await call(router.photos.ratios, { album: w.a.tagAlbum }, { context: w.ctx.guest });
		expect(new Set(guest.ids)).toEqual(new Set([w.p.p1, w.p.p2]));
		const alice = await call(router.photos.ratios, { album: w.a.tagAlbum }, { context: w.ctx.alice });
		expect(new Set(alice.ids)).toEqual(new Set([w.p.p1, w.p.p2, w.p.p4]));
	});

	it("smart albums apply the viewer's visibility", async () => {
		if (await settingBool("smart.unsorted")) {
			const u = await call(router.photos.ratios, { album: "unsorted" }, { context: w.ctx.alice });
			expect(u.ids).toEqual([w.p.p7]);
			const ub = await call(router.photos.ratios, { album: "unsorted" }, { context: w.ctx.bob });
			expect(ub.ids).toEqual([w.p.b1]);
			await expect(
				call(router.photos.ratios, { album: "unsorted" }, { context: w.ctx.guest }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		}
		if (await settingBool("features.timeline", true)) {
			const t = await call(router.photos.ratios, { album: "timeline" }, { context: w.ctx.bob });
			expect(t.ids).toEqual(expect.arrayContaining([w.p.p1, w.p.p5, w.p.b1]));
			expect(t.ids).not.toContain(w.p.p4);
			expect(t.ids).not.toContain(w.p.p6);
			// Ordered by capture date, newest first.
			expect(t.ids.indexOf(w.p.p8)).toBeLessThan(t.ids.indexOf(w.p.p1));
		}
		if (await settingBool("smart.recent")) {
			const r = await call(router.photos.ratios, { album: "recent" }, { context: w.ctx.alice });
			expect(r.ids).toEqual(expect.arrayContaining([w.p.p1, w.p.p4, w.p.p7]));
		}
	});
});

describe("photos.details", () => {
	it("filters variants and albums by rights", async () => {
		const [guest] = await call(
			router.photos.details,
			{ album: w.a.pub, ids: [w.p.p1] },
			{ context: w.ctx.guest },
		);
		expect(guest?.sizeVariants.map((v) => v.type).sort()).toEqual(["small", "thumb"]);
		expect(guest?.albums).toEqual([{ id: w.a.pub, title: `Public ${w.rand}` }]);
		expect(guest?.rights).toEqual({
			canEdit: false,
			canDelete: false,
			canMove: false,
			canDownload: false,
			canAccessFullPhoto: false,
		});
		expect(guest?.tags).toEqual([{ id: w.tagA.id, name: w.tagNames.a }]);
		expect(guest?.myRating).toBeNull();

		const [alice] = await call(
			router.photos.details,
			{ album: w.a.pub, ids: [w.p.p1] },
			{ context: w.ctx.alice },
		);
		expect(alice?.sizeVariants.map((v) => v.type)).toContain("original");
		expect(alice?.albums.map((a) => a.id).sort()).toEqual([w.a.pub, w.a.priv].sort());
		expect(alice?.rights.canEdit).toBe(true);
		expect(alice?.make).toBe("Canon");
		expect(alice?.createdAt).toMatch(/Z$/);
	});

	it("only returns photos inside the scope", async () => {
		const r = await call(
			router.photos.details,
			{ album: w.a.pub, ids: [w.p.p4, w.p.p2] },
			{ context: w.ctx.alice },
		);
		expect(r.map((d) => d.id)).toEqual([w.p.p2]);
		const shared = await call(
			router.photos.details,
			{ album: w.a.shared, ids: [w.p.p5] },
			{ context: w.ctx.bob },
		);
		expect(shared[0]?.rights).toMatchObject({ canEdit: true, canDelete: false, canAccessFullPhoto: true });
		expect(shared[0]?.sizeVariants.map((v) => v.type)).toContain("original");
	});
});

describe("photo mutations", () => {
	it("update needs edit rights and replaces tags", async () => {
		await expect(
			call(router.photos.update, { ids: [w.p.p1], patch: { title: "x" } }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await call(
			router.photos.update,
			{
				ids: [w.p.p5],
				patch: { title: "Renamed", tagNames: [`bobtag-${w.rand}`], takenAt: "2021-01-01T00:00:00Z" },
			},
			{ context: w.ctx.bob },
		);
		const [d] = await call(
			router.photos.details,
			{ album: w.a.shared, ids: [w.p.p5] },
			{ context: w.ctx.bob },
		);
		expect(d?.title).toBe("Renamed");
		expect(d?.takenAt).toBe("2021-01-01T00:00:00.000Z");
		expect(d?.tags.map((t) => t.name)).toEqual([`bobtag-${w.rand}`]);
	});

	it("highlight and rate", async () => {
		await call(router.photos.highlight, { ids: [w.p.p2], value: true }, { context: w.ctx.alice });
		await call(router.photos.rate, { id: w.p.p2, rating: 4 }, { context: w.ctx.bob });
		await call(router.photos.rate, { id: w.p.p2, rating: 2 }, { context: w.ctx.alice });
		let [d] = await call(router.photos.details, { album: w.a.pub, ids: [w.p.p2] }, { context: w.ctx.bob });
		expect(d?.isHighlighted).toBe(true);
		expect(d?.ratingAvg).toBeCloseTo(3);
		expect(d?.myRating).toBe(4);
		await call(router.photos.rate, { id: w.p.p2, rating: 0 }, { context: w.ctx.bob });
		[d] = await call(router.photos.details, { album: w.a.pub, ids: [w.p.p2] }, { context: w.ctx.bob });
		expect(d?.ratingAvg).toBeCloseTo(2);
		expect(d?.myRating).toBeNull();
		await expect(
			call(router.photos.rate, { id: w.p.p4, rating: 3 }, { context: w.ctx.bob }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(
			call(router.photos.rate, { id: w.p.p2, rating: 3 }, { context: w.ctx.guest }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("move, copy and albumsOf", async () => {
		// bob may not move photos out of an album he cannot move in.
		await expect(
			call(
				router.photos.move,
				{ ids: [w.p.p5], fromAlbum: w.a.shared, toAlbum: w.a.pub },
				{ context: w.ctx.bob },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		// alice files her unsorted photo, copies it and moves it between albums.
		await call(
			router.photos.move,
			{ ids: [w.p.p7], fromAlbum: null, toAlbum: w.a.hidden },
			{ context: w.ctx.alice },
		);
		await call(router.photos.copy, { ids: [w.p.p7], toAlbum: w.a.priv }, { context: w.ctx.alice });
		await call(
			router.photos.move,
			{ ids: [w.p.p7], fromAlbum: w.a.hidden, toAlbum: w.a.shared },
			{ context: w.ctx.alice },
		);
		const links = await db.select().from(photoAlbum).where(eq(photoAlbum.photoId, w.p.p7));
		expect(links.map((l) => l.albumId).sort()).toEqual([w.a.priv, w.a.shared].sort());

		const forBob = await call(router.photos.albumsOf, { id: w.p.p7 }, { context: w.ctx.bob });
		expect(forBob).toEqual([{ id: w.a.shared, title: `Shared ${w.rand}` }]);
		await expect(call(router.photos.albumsOf, { id: w.p.p4 }, { context: w.ctx.bob })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		// bob cannot copy alice's public photo into the album he edits (needs edit rights on the photo).
		await expect(
			call(router.photos.copy, { ids: [w.p.p1], toAlbum: w.a.shared }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("delete needs delete rights", async () => {
		await expect(call(router.photos.delete, { ids: [w.p.p5] }, { context: w.ctx.bob })).rejects.toMatchObject(
			{
				code: "FORBIDDEN",
			},
		);
		await call(router.photos.delete, { ids: [w.p.p3] }, { context: w.ctx.alice });
		const rows = await db
			.select()
			.from(photosTable)
			.where(inArray(photosTable.id, [w.p.p3]));
		expect(rows).toEqual([]);
	});
});
