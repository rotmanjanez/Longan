import { call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.DATABASE_URL ??= "postgres://longan:longan@localhost:5433/longan";
	process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
	process.env.OIDC_ISSUER ??= "http://localhost:8080/realms/longan";
	process.env.OIDC_CLIENT_ID ??= "longan";
});

import { sql as pg } from "../../db/index.ts";
import { router } from "../router.ts";
import { createWorld, type World } from "./gallery.fixtures.ts";

let w: World;

beforeAll(async () => {
	w = await createWorld();
});

afterAll(async () => {
	await w?.destroy();
	await pg.end();
});

const none = {
	grantsFullPhotoAccess: false,
	grantsDownload: false,
	grantsUpload: false,
	grantsEdit: false,
	grantsDelete: false,
	grantsMove: false,
};

describe("sharing", () => {
	it("only owners (and admins) manage shares", async () => {
		await expect(
			call(router.sharing.list, { albumId: w.a.shared }, { context: w.ctx.bob }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			call(
				router.sharing.add,
				{ albumIds: [w.a.priv], userIds: [w.bob.id], grants: none },
				{ context: w.ctx.bob },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(call(router.sharing.listAll, undefined, { context: w.ctx.guest })).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("add, list, update and remove grants", async () => {
		const list0 = await call(router.sharing.list, { albumId: w.a.shared }, { context: w.ctx.alice });
		expect(list0).toHaveLength(1);
		expect(list0[0]).toMatchObject({
			albumId: w.a.shared,
			grantsEdit: true,
			user: { id: w.bob.id, username: w.bob.username, displayName: "Bob Test" },
		});

		// Before sharing, bob cannot open priv.
		await expect(call(router.albums.head, { id: w.a.priv }, { context: w.ctx.bob })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await call(
			router.sharing.add,
			{
				albumIds: [w.a.priv, w.a.shared],
				userIds: [w.bob.id, w.alice.id],
				grants: { ...none, grantsDownload: true },
			},
			{ context: w.ctx.alice },
		);
		const all = await call(router.sharing.listAll, undefined, { context: w.ctx.alice });
		const mine = all.filter((g) => g.user.id === w.bob.id);
		expect(mine.map((g) => g.albumId).sort()).toEqual([w.a.priv, w.a.shared].sort());
		// Upsert replaced the existing grant on `shared`; no share with the owner herself.
		expect(mine.find((g) => g.albumId === w.a.shared)?.grantsEdit).toBe(false);
		expect(all.some((g) => g.user.id === w.alice.id)).toBe(false);
		expect(all.find((g) => g.albumId === w.a.priv)?.albumTitle).toBe(`Private ${w.rand}`);

		const head = await call(router.albums.head, { id: w.a.priv }, { context: w.ctx.bob });
		expect(head.rights).toMatchObject({ canDownload: true, canEdit: false });
		const root = await call(router.albums.root, undefined, { context: w.ctx.bob });
		expect(root.shared.map((t) => t.id).sort()).toEqual([w.a.priv, w.a.shared].sort());

		const grant = mine.find((g) => g.albumId === w.a.priv)!;
		await call(
			router.sharing.update,
			{ id: grant.id, grants: { ...none, grantsEdit: true } },
			{ context: w.ctx.alice },
		);
		const head2 = await call(router.albums.head, { id: w.a.priv }, { context: w.ctx.bob });
		expect(head2.rights).toMatchObject({ canDownload: false, canEdit: true });
		await expect(
			call(router.sharing.update, { id: grant.id, grants: none }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		await call(router.sharing.remove, { ids: [grant.id] }, { context: w.ctx.alice });
		await expect(call(router.albums.head, { id: w.a.priv }, { context: w.ctx.bob })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		const admin = await call(router.sharing.listAll, undefined, { context: w.ctx.admin });
		expect(admin.some((g) => g.albumId === w.a.shared)).toBe(true);
	});
});

describe("tags", () => {
	it("lists tags with counts of visible photos", async () => {
		const guest = await call(router.tags.list, undefined, { context: w.ctx.guest });
		expect(guest.find((t) => t.id === w.tagA.id)?.count).toBe(2);
		const alice = await call(router.tags.list, undefined, { context: w.ctx.alice });
		expect(alice.find((t) => t.id === w.tagA.id)?.count).toBe(3);
	});

	it("attach, detach, rename, merge and delete", async () => {
		await expect(
			call(router.tags.attach, { photoIds: [w.p.p1], names: ["x"] }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const c = `tagC-${w.rand}`;
		await call(router.tags.attach, { photoIds: [w.p.p3, w.p.p4], names: [c] }, { context: w.ctx.alice });
		let list = await call(router.tags.list, undefined, { context: w.ctx.alice });
		const tagC = list.find((t) => t.name === c)!;
		expect(tagC.count).toBe(2);
		await call(router.tags.detach, { photoIds: [w.p.p4], tagIds: [tagC.id] }, { context: w.ctx.alice });

		// Renaming onto an existing name merges.
		await call(router.tags.rename, { id: tagC.id, name: w.tagNames.b }, { context: w.ctx.alice });
		list = await call(router.tags.list, undefined, { context: w.ctx.alice });
		expect(list.find((t) => t.id === tagC.id)).toBeUndefined();
		expect(list.find((t) => t.id === w.tagB.id)?.count).toBe(2);

		const renamed = `tagB2-${w.rand}`;
		await call(router.tags.rename, { id: w.tagB.id, name: renamed }, { context: w.ctx.alice });
		list = await call(router.tags.list, undefined, { context: w.ctx.alice });
		expect(list.find((t) => t.id === w.tagB.id)?.name).toBe(renamed);

		await call(router.tags.merge, { sourceIds: [w.tagB.id], targetId: w.tagA.id }, { context: w.ctx.alice });
		list = await call(router.tags.list, undefined, { context: w.ctx.alice });
		expect(list.find((t) => t.id === w.tagA.id)?.count).toBe(4);
		expect(list.find((t) => t.id === w.tagB.id)).toBeUndefined();

		await expect(
			call(router.tags.delete, { ids: [w.tagA.id] }, { context: w.ctx.bob }),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await call(router.tags.delete, { ids: [w.tagA.id] }, { context: w.ctx.alice });
		list = await call(router.tags.list, undefined, { context: w.ctx.admin });
		expect(list.find((t) => t.id === w.tagA.id)).toBeUndefined();
	});
});
