import { randomBytes } from "node:crypto";
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
import { accessPermissions, albums as albumsTable, photoAlbum, photos, sessions } from "../../db/schema.ts";
import { newId } from "../../lib/ids.ts";
import { settingBool } from "../../settings/index.ts";
import { router } from "../router.ts";
import { reachableCrumbs } from "./albums.ts";
import { createWorld, ctxFor, type World } from "./gallery.fixtures.ts";

let w: World;

beforeAll(async () => {
	w = await createWorld();
});

afterAll(async () => {
	await w?.destroy();
	await pg.end();
});

const ids = (tiles: { id: string }[]) => tiles.map((t) => t.id);

describe("albums.root", () => {
	it("guest sees public listed albums only", async () => {
		const r = await call(router.albums.root, undefined, { context: w.ctx.guest });
		const all = ids(r.albums);
		expect(all).toContain(w.a.pub);
		expect(all).toContain(w.a.pwd);
		expect(all).not.toContain(w.a.hidden);
		expect(all).not.toContain(w.a.priv);
		expect(all).not.toContain(w.a.shared);
		expect(all).not.toContain(w.a.pwd2);
		expect(r.shared).toEqual([]);
		expect(ids(r.tagAlbums)).toContain(w.a.tagAlbum);
		if (!(await settingBool("smart.public"))) expect(r.smart).toEqual([]);
		expect(r.smart.map((s) => s.id)).not.toContain("unsorted");

		const pub = r.albums.find((t) => t.id === w.a.pub)!;
		expect(pub.numPhotos).toBe(3);
		expect(pub.hasChildren).toBe(true);
		expect(pub.isPublic).toBe(true);
		expect(pub.isLocked).toBe(false);
		expect(pub.minTakenAt).toBe("2023-07-04T22:00:00.000Z");
		expect(pub.maxTakenAt).toBe("2024-03-15T10:00:00.000Z");
		expect(pub.coverId).not.toBeNull();

		const pwd = r.albums.find((t) => t.id === w.a.pwd)!;
		expect(pwd.isLocked).toBe(true);
		expect(pwd.coverId).toBeNull();
	});

	it("tag album tiles count visible tagged photos", async () => {
		// tagA is on p1, p2 (public via pub) and p4 (private).
		const guest = await call(router.albums.root, undefined, { context: w.ctx.guest });
		expect(guest.tagAlbums.find((t) => t.id === w.a.tagAlbum)?.numPhotos).toBe(2);
		const alice = await call(router.albums.root, undefined, { context: w.ctx.alice });
		expect(alice.tagAlbums.find((t) => t.id === w.a.tagAlbum)?.numPhotos).toBe(3);
	});

	it("owner sees all own top-level albums and unsorted", async () => {
		const r = await call(router.albums.root, undefined, { context: w.ctx.alice });
		const all = ids(r.albums);
		for (const id of [w.a.pub, w.a.hidden, w.a.priv, w.a.shared, w.a.pwd, w.a.pwd2])
			expect(all).toContain(id);
		expect(all).not.toContain(w.a.child);
		const pwd = r.albums.find((t) => t.id === w.a.pwd)!;
		expect(pwd.isLocked).toBe(false);
		if (await settingBool("smart.unsorted")) {
			const unsorted = r.smart.find((s) => s.id === "unsorted");
			expect(unsorted?.numPhotos).toBe(1);
			expect(unsorted?.coverId).toBe(w.p.p7);
		}
	});

	it("bob sees albums shared with him under shared", async () => {
		const r = await call(router.albums.root, undefined, { context: w.ctx.bob });
		expect(ids(r.shared)).toEqual([w.a.shared]);
		expect(ids(r.albums)).not.toContain(w.a.shared);
		expect(ids(r.albums)).not.toContain(w.a.priv);
	});
});

describe("albums.head / children", () => {
	it("enforces access for guests", async () => {
		await expect(call(router.albums.head, { id: w.a.priv }, { context: w.ctx.guest })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		await expect(call(router.albums.head, { id: w.a.pwd }, { context: w.ctx.guest })).rejects.toMatchObject({
			code: "PASSWORD_REQUIRED",
			status: 403,
		});
		const hidden = await call(router.albums.head, { id: w.a.hidden }, { context: w.ctx.guest });
		expect(hidden.id).toBe(w.a.hidden);
		expect(hidden.protection).toBeNull();
		expect(hidden.rights.canEdit).toBe(false);
		expect(hidden.rights.canAccessFullPhoto).toBe(true);
	});

	it("returns breadcrumbs, counts and protection for editors", async () => {
		const child = await call(router.albums.head, { id: w.a.child }, { context: w.ctx.guest });
		expect(child.breadcrumbs).toEqual([{ id: w.a.pub, title: `Public ${w.rand}` }]);
		expect(child.parentId).toBe(w.a.pub);
		expect(child.numPhotos).toBe(1);

		const pub = await call(router.albums.head, { id: w.a.pub }, { context: w.ctx.alice });
		expect(pub.rights.canShare).toBe(true);
		expect(pub.protection).toMatchObject({ isPublic: true, hasPassword: false, isLinkRequired: false });
		expect(pub.ownerName).toBe("Alice Test");
		expect(pub.numChildren).toBe(2);

		const pubGuest = await call(router.albums.head, { id: w.a.pub }, { context: w.ctx.guest });
		expect(pubGuest.numChildren).toBe(1);

		const shared = await call(router.albums.head, { id: w.a.shared }, { context: w.ctx.bob });
		expect(shared.rights).toMatchObject({ canEdit: true, canShare: false, canDelete: false });
		expect(shared.protection).not.toBeNull();

		const tag = await call(router.albums.head, { id: w.a.tagAlbum }, { context: w.ctx.guest });
		expect(tag.kind).toBe("tag");
		expect(tag.tags).toEqual([{ id: w.tagA.id, name: w.tagNames.a }]);
		expect(tag.tagLogic).toBe("or");
	});

	it("children are filtered by listing rights", async () => {
		const guest = await call(router.albums.children, { id: w.a.pub }, { context: w.ctx.guest });
		expect(ids(guest)).toEqual([w.a.child]);
		const alice = await call(router.albums.children, { id: w.a.pub }, { context: w.ctx.alice });
		expect(ids(alice).sort()).toEqual([w.a.child, w.a.privChild].sort());
		await expect(
			call(router.albums.children, { id: w.a.priv }, { context: w.ctx.bob }),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("tree lists editable albums", async () => {
		const bob = await call(router.albums.tree, undefined, { context: w.ctx.bob });
		expect(bob.ids).toEqual([w.a.shared]);
		expect(bob.parentIds).toEqual([null]);
		const alice = await call(router.albums.tree, undefined, { context: w.ctx.alice });
		expect(alice.ids).toContain(w.a.child);
		expect(alice.parentIds[alice.ids.indexOf(w.a.child)]).toBe(w.a.pub);
		expect(alice.ids).not.toContain(w.a.tagAlbum);
	});
});

describe("albums.unlock", () => {
	it("gives a guest an anonymous session that remembers the unlock", async () => {
		const ctx = ctxFor(w.ctx.guest.viewer, null);
		await call(router.albums.unlock, { id: w.a.pwd, password: "secret" }, { context: ctx });
		const cookie = ctx.resHeaders.get("set-cookie");
		expect(cookie).toMatch(/^longan_session=/);
		const sid = decodeURIComponent(cookie!.split(";")[0]!.slice("longan_session=".length)).split(".")[0]!;
		const [s] = await db.select().from(sessions).where(eq(sessions.id, sid));
		expect(s?.userId).toBeNull();
		expect(s?.unlockedAlbumIds).toEqual(expect.arrayContaining([w.a.pwd, w.a.pwd2]));
		await db.delete(sessions).where(eq(sessions.id, sid));
	});

	it("rejects a wrong password and unlocks all albums sharing the password", async () => {
		await expect(
			call(router.albums.unlock, { id: w.a.pwd, password: "nope" }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await call(router.albums.unlock, { id: w.a.pwd, password: "secret" }, { context: w.ctx.bob });
		const [s] = await db.select().from(sessions).where(eq(sessions.id, w.bobSession));
		expect(s?.unlockedAlbumIds).toEqual(expect.arrayContaining([w.a.pwd, w.a.pwd2]));

		const unlocked = ctxFor(
			{ ...w.ctx.bob.viewer, unlockedAlbumIds: s!.unlockedAlbumIds },
			w.bob,
			w.bobSession,
		);
		const head = await call(router.albums.head, { id: w.a.pwd2 }, { context: unlocked });
		expect(head.id).toBe(w.a.pwd2);
		const ratios = await call(router.photos.ratios, { album: w.a.pwd }, { context: unlocked });
		expect(ratios.ids).toEqual([w.p.p6]);
		const root = await call(router.albums.root, undefined, { context: unlocked });
		expect(root.albums.find((t) => t.id === w.a.pwd)?.isLocked).toBe(false);
	});
});

describe("albums mutations", () => {
	it("create applies defaults and checks parent rights", async () => {
		await expect(
			call(router.albums.create, { title: "x", parentId: null }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			call(router.albums.create, { title: "x", parentId: w.a.pub }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const { id } = await call(
			router.albums.create,
			{ title: "New", parentId: w.a.pub },
			{ context: w.ctx.alice },
		);
		const [row] = await db.select().from(albumsTable).where(eq(albumsTable.id, id));
		expect(row).toMatchObject({ parentId: w.a.pub, ownerId: w.alice.id, kind: "album" });

		const tag = await call(
			router.albums.create,
			{
				title: "Tags",
				parentId: null,
				kind: "tag",
				tagNames: [w.tagNames.b, `new-${w.rand}`],
				tagLogic: "and",
			},
			{ context: w.ctx.alice },
		);
		const head = await call(router.albums.head, { id: tag.id }, { context: w.ctx.alice });
		expect(head.tags.map((t) => t.name).sort()).toEqual([`new-${w.rand}`, w.tagNames.b].sort());
		expect(head.tagLogic).toBe("and");
		await call(
			router.albums.update,
			{ id: tag.id, patch: { tagNames: [w.tagNames.b] } },
			{ context: w.ctx.alice },
		);
		const ratios = await call(router.photos.ratios, { album: tag.id }, { context: w.ctx.alice });
		expect(ratios.ids).toEqual([w.p.p2]);
		await call(router.albums.delete, { ids: [tag.id, id] }, { context: w.ctx.alice });
	});

	it("update checks rights, slug conflicts and cover membership", async () => {
		await expect(
			call(router.albums.update, { id: w.a.pub, patch: { title: "hack" } }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await call(
			router.albums.update,
			{ id: w.a.shared, patch: { description: "by bob" } },
			{ context: w.ctx.bob },
		);

		const slug = `slug-${w.rand}`;
		await call(router.albums.update, { id: w.a.pub, patch: { slug } }, { context: w.ctx.alice });
		await expect(
			call(router.albums.update, { id: w.a.priv, patch: { slug } }, { context: w.ctx.alice }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await call(router.albums.update, { id: w.a.pub, patch: { slug: null } }, { context: w.ctx.alice });

		await expect(
			call(router.albums.update, { id: w.a.pub, patch: { coverId: w.p.p4 } }, { context: w.ctx.alice }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await call(router.albums.update, { id: w.a.pub, patch: { coverId: w.p.p3 } }, { context: w.ctx.alice });
		const root = await call(router.albums.root, undefined, { context: w.ctx.guest });
		expect(root.albums.find((t) => t.id === w.a.pub)?.coverId).toBe(w.p.p3);
		await call(router.albums.update, { id: w.a.pub, patch: { coverId: null } }, { context: w.ctx.alice });
	});

	it("move prevents cycles and merge relinks photos", async () => {
		const { id: x } = await call(
			router.albums.create,
			{ title: "X", parentId: null },
			{ context: w.ctx.alice },
		);
		const { id: y } = await call(router.albums.create, { title: "Y", parentId: x }, { context: w.ctx.alice });
		await expect(
			call(router.albums.move, { ids: [x], targetId: y }, { context: w.ctx.alice }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			call(router.albums.move, { ids: [x], targetId: w.a.tagAlbum }, { context: w.ctx.alice }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await call(router.albums.move, { ids: [y], targetId: null }, { context: w.ctx.alice });
		await db.insert(photoAlbum).values({ photoId: w.p.p7, albumId: y });
		const { id: z } = await call(router.albums.create, { title: "Z", parentId: y }, { context: w.ctx.alice });

		await call(router.albums.merge, { ids: [y], targetId: x }, { context: w.ctx.alice });
		const xRatios = await call(router.photos.ratios, { album: x }, { context: w.ctx.alice });
		expect(xRatios.ids).toEqual([w.p.p7]);
		const kids = await call(router.albums.children, { id: x }, { context: w.ctx.alice });
		expect(ids(kids)).toEqual([z]);

		// p7's only album goes away; without the media module it stays as unsorted.
		await call(router.albums.delete, { ids: [x] }, { context: w.ctx.alice });
		const gone = await db.select().from(albumsTable).where(eq(albumsTable.id, z));
		expect(gone).toEqual([]);
	});

	it("setProtection manages the public row", async () => {
		await expect(
			call(
				router.albums.setProtection,
				{
					id: w.a.shared,
					isPublic: true,
					isLinkRequired: false,
					isNsfw: false,
					grantsFullPhotoAccess: false,
					grantsDownload: false,
					grantsUpload: false,
				},
				{ context: w.ctx.bob },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const base = {
			id: w.a.priv,
			isLinkRequired: true,
			isNsfw: true,
			grantsFullPhotoAccess: true,
			grantsDownload: true,
			grantsUpload: false,
		};
		await call(
			router.albums.setProtection,
			{ ...base, isPublic: true, password: "pw" },
			{ context: w.ctx.alice },
		);
		let head = await call(router.albums.head, { id: w.a.priv }, { context: w.ctx.alice });
		expect(head.isNsfw).toBe(true);
		expect(head.protection).toMatchObject({ isPublic: true, isLinkRequired: true, hasPassword: true });
		await expect(call(router.albums.head, { id: w.a.priv }, { context: w.ctx.guest })).rejects.toMatchObject({
			code: "PASSWORD_REQUIRED",
		});
		await call(router.albums.setProtection, { ...base, isPublic: true }, { context: w.ctx.alice });
		head = await call(router.albums.head, { id: w.a.priv }, { context: w.ctx.alice });
		expect(head.protection?.hasPassword).toBe(true);
		await call(
			router.albums.setProtection,
			{ ...base, isPublic: true, password: null },
			{ context: w.ctx.alice },
		);
		const guestHead = await call(router.albums.head, { id: w.a.priv }, { context: w.ctx.guest });
		expect(guestHead.rights.canDownload).toBe(true);

		await call(
			router.albums.setProtection,
			{ ...base, isNsfw: false, isPublic: false },
			{ context: w.ctx.alice },
		);
		const rows = await db.select().from(accessPermissions).where(eq(accessPermissions.albumId, w.a.priv));
		expect(rows).toEqual([]);
	});
});

describe("albums move/delete across owners", () => {
	const grants = {
		grantsFullPhotoAccess: false,
		grantsDownload: false,
		grantsUpload: false,
		grantsEdit: false,
		grantsDelete: false,
		grantsMove: false,
	};
	const albumOf = async (ownerId: number, title: string, parentId: string | null = null) => {
		const id = newId();
		await db.insert(albumsTable).values({ id, ownerId, title: `${title} ${w.rand}`, parentId });
		return id;
	};
	const photoIn = async (albumId: string) => {
		const id = newId();
		await db.insert(photos).values({
			id,
			ownerId: w.alice.id,
			title: `Only in ${albumId}`,
			type: "image",
			mime: "image/jpeg",
			filesize: 1000,
			checksum: randomBytes(20).toString("hex"),
			originalChecksum: randomBytes(20).toString("hex"),
			width: 300,
			height: 200,
		});
		await db.insert(photoAlbum).values({ photoId: id, albumId });
		return id;
	};
	const parentOf = async (id: string) =>
		(await db.select({ parentId: albumsTable.parentId }).from(albumsTable).where(eq(albumsTable.id, id)))[0]
			?.parentId;
	const existing = async (albumIds: string[]) =>
		(await db.select({ id: albumsTable.id }).from(albumsTable).where(inArray(albumsTable.id, albumIds)))
			.map((r) => r.id)
			.sort();

	it("a move-only sharee cannot graft the owner's album into their own and delete it", async () => {
		const s = await albumOf(w.alice.id, "S");
		const s2 = await albumOf(w.alice.id, "S2", s);
		const q = await photoIn(s2);
		const t = await albumOf(w.bob.id, "T");
		await db.insert(accessPermissions).values({ albumId: s, userId: w.bob.id, ...grants, grantsMove: true });

		await expect(
			call(router.albums.move, { ids: [s], targetId: t }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect((await db.select().from(albumsTable).where(eq(albumsTable.id, s)))[0]?.parentId).toBeNull();

		// Even once grafted (only an admin can do that now), bob's delete must not cascade into alice's albums:
		// her album is detached to the top level with its sub-album and photo intact.
		await call(router.albums.move, { ids: [s], targetId: t }, { context: w.ctx.admin });
		await call(router.albums.delete, { ids: [t] }, { context: w.ctx.bob });
		expect(await existing([s, s2, t])).toEqual([s, s2].sort());
		expect(await parentOf(s)).toBeNull();
		expect(await parentOf(s2)).toBe(s);
		expect(await db.select({ id: photos.id }).from(photos).where(eq(photos.id, q))).toEqual([{ id: q }]);

		await call(router.albums.delete, { ids: [s] }, { context: w.ctx.admin });
		await db.delete(photos).where(eq(photos.id, q));
	});

	it("a delete-grant sharee cannot merge the owner's album into their own", async () => {
		const s = await albumOf(w.alice.id, "MS");
		const s2 = await albumOf(w.alice.id, "MS2", s);
		const t = await albumOf(w.bob.id, "MT");
		const a = await albumOf(w.alice.id, "MA");
		await db.insert(accessPermissions).values([
			{ albumId: s, userId: w.bob.id, ...grants, grantsDelete: true },
			{ albumId: a, userId: w.bob.id, ...grants, grantsEdit: true },
		]);
		await expect(
			call(router.albums.merge, { ids: [s], targetId: t }, { context: w.ctx.bob }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await parentOf(s2)).toBe(s);
		// Into another album of the same owner it is allowed.
		await call(router.albums.merge, { ids: [s], targetId: a }, { context: w.ctx.bob });
		expect(await existing([s, s2, a])).toEqual([s2, a].sort());
		expect(await parentOf(s2)).toBe(a);
		await call(router.albums.delete, { ids: [a, t] }, { context: w.ctx.admin });
	});

	it("tree with sameOwnerAs lists only albums of the sources' owner", async () => {
		const mine = await albumOf(w.alice.id, "TreeMine");
		const theirs = await albumOf(w.bob.id, "TreeTheirs");
		const src = await albumOf(w.bob.id, "TreeSrc");
		await db
			.insert(accessPermissions)
			.values({ albumId: mine, userId: w.bob.id, ...grants, grantsEdit: true });
		const all = await call(router.albums.tree, undefined, { context: w.ctx.bob });
		expect(all.ids).toEqual(expect.arrayContaining([mine, theirs, src]));
		const same = await call(router.albums.tree, { sameOwnerAs: [src] }, { context: w.ctx.bob });
		expect(same.ids).toEqual(expect.arrayContaining([theirs, src]));
		expect(same.ids).not.toContain(mine);
		// An album the viewer cannot access is ignored rather than used as an ownership oracle.
		const hidden = await albumOf(w.alice.id, "TreeHidden");
		const probe = await call(router.albums.tree, { sameOwnerAs: [hidden] }, { context: w.ctx.bob });
		expect(probe.ids).toEqual(all.ids);
		await call(router.albums.delete, { ids: [mine, theirs, src, hidden] }, { context: w.ctx.admin });
	});

	it("non-admins cannot move an album under another owner's album", async () => {
		const mine = await albumOf(w.alice.id, "Mine");
		const theirs = await albumOf(w.bob.id, "Theirs");
		// Alice has full rights on her album and upload rights on bob's: the owner mismatch alone rejects it.
		await db
			.insert(accessPermissions)
			.values({ albumId: theirs, userId: w.alice.id, ...grants, grantsUpload: true, grantsEdit: true });
		await expect(
			call(router.albums.move, { ids: [mine], targetId: theirs }, { context: w.ctx.alice }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await call(router.albums.delete, { ids: [mine, theirs] }, { context: w.ctx.admin });
	});

	it("delete detaches sub-albums the caller may not delete instead of cascading into them", async () => {
		const top = await albumOf(w.alice.id, "Top");
		const mid = await albumOf(w.alice.id, "Mid", top);
		const foreign = await albumOf(w.bob.id, "Foreign", mid);
		const deep = await albumOf(w.bob.id, "Deep", foreign);
		await call(router.albums.delete, { ids: [top] }, { context: w.ctx.alice });
		expect(await existing([top, mid, foreign, deep])).toEqual([foreign, deep].sort());
		expect(await parentOf(foreign)).toBeNull();
		expect(await parentOf(deep)).toBe(foreign);
		await call(router.albums.delete, { ids: [foreign] }, { context: w.ctx.admin });

		// A delete grant on the descendant lets it go with the album; admins delete everything.
		const top1 = await albumOf(w.alice.id, "Top1");
		const foreign1 = await albumOf(w.bob.id, "Foreign1", top1);
		await db
			.insert(accessPermissions)
			.values({ albumId: foreign1, userId: w.alice.id, ...grants, grantsDelete: true });
		await call(router.albums.delete, { ids: [top1] }, { context: w.ctx.alice });
		expect(await existing([top1, foreign1])).toEqual([]);

		const top2 = await albumOf(w.alice.id, "Top2");
		const foreign2 = await albumOf(w.bob.id, "Foreign2", top2);
		await call(router.albums.delete, { ids: [top2] }, { context: w.ctx.admin });
		expect(await existing([top2, foreign2])).toEqual([]);
	});

	it("same-owner moves (owner or sharee) and owner deletes still work", async () => {
		const a1 = await albumOf(w.alice.id, "A1");
		const a2 = await albumOf(w.alice.id, "A2");
		const a3 = await albumOf(w.alice.id, "A3");
		const q = await photoIn(a2);
		await call(router.albums.move, { ids: [a2], targetId: a1 }, { context: w.ctx.alice });

		await db.insert(accessPermissions).values([
			{ albumId: a3, userId: w.bob.id, ...grants, grantsMove: true },
			{ albumId: a1, userId: w.bob.id, ...grants, grantsEdit: true },
		]);
		await call(router.albums.move, { ids: [a3], targetId: a1 }, { context: w.ctx.bob });
		const kids = await call(router.albums.children, { id: a1 }, { context: w.ctx.alice });
		expect(ids(kids).sort()).toEqual([a2, a3].sort());

		await call(router.albums.delete, { ids: [a1] }, { context: w.ctx.alice });
		expect(await existing([a1, a2, a3])).toEqual([]);
		// q lost its only album: deleted with it, or left unsorted when the media module is unavailable.
		expect(await db.select().from(photoAlbum).where(eq(photoAlbum.photoId, q))).toEqual([]);
		await db.delete(photos).where(eq(photos.id, q));
	});
});

describe("reachableCrumbs", () => {
	const row = (id: string, ok: boolean) => ({ id, title: id.toUpperCase(), ok });
	it("keeps the whole chain when every parent can be opened", () => {
		expect(reachableCrumbs([row("a", true), row("b", true)])).toEqual([
			{ id: "a", title: "A" },
			{ id: "b", title: "B" },
		]);
	});
	it("stops at the first parent the viewer cannot open", () => {
		expect(reachableCrumbs([row("a", true), row("b", false), row("c", true)])).toEqual([
			{ id: "c", title: "C" },
		]);
		expect(reachableCrumbs([row("a", true), row("b", true), row("c", false)])).toEqual([]);
	});
});
