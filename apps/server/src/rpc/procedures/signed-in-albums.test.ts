/**
 * Albums whose public row has requires_login: open to every signed-in user, invisible to anonymous visitors.
 * Builds its own albums on top of the shared fixture world so the other suites' expectations stay unchanged.
 */
import { randomBytes } from "node:crypto";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.DATABASE_URL ??= "postgres://longan:longan@localhost:5433/longan";
	process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
	process.env.OIDC_ISSUER ??= "http://localhost:8080/realms/longan";
	process.env.OIDC_CLIENT_ID ??= "longan";
});

import { db, sql as pg } from "../../db/index.ts";
import { accessPermissions, albums, photoAlbum, photos } from "../../db/schema.ts";
import { newId } from "../../lib/ids.ts";
import { router } from "../router.ts";
import { createWorld, type World } from "./gallery.fixtures.ts";
import { hashPassword } from "./password.ts";

let w: World;
/** org: signed-in only, listed. orgPwd: signed-in only, link required, password "secret". */
const ids = { org: newId(), orgPwd: newId(), photo: newId() };

beforeAll(async () => {
	w = await createWorld();
	await db.insert(albums).values([
		{ id: ids.org, title: `Org ${w.rand}`, ownerId: w.alice.id },
		{ id: ids.orgPwd, title: `OrgPwd ${w.rand}`, ownerId: w.alice.id },
	]);
	await db.insert(accessPermissions).values([
		{
			albumId: ids.org,
			userId: null,
			requiresLogin: true,
			grantsFullPhotoAccess: true,
			grantsDownload: true,
		},
		{
			albumId: ids.orgPwd,
			userId: null,
			requiresLogin: true,
			isLinkRequired: true,
			passwordHash: await hashPassword("secret"),
		},
	]);
	await db.insert(photos).values({
		id: ids.photo,
		ownerId: w.alice.id,
		title: `Team offsite ${w.rand}`,
		type: "image",
		mime: "image/jpeg",
		filesize: 1000,
		checksum: randomBytes(20).toString("hex"),
		originalChecksum: randomBytes(20).toString("hex"),
		width: 300,
		height: 200,
		takenAt: "2024-06-01T00:00:00Z",
	});
	await db.insert(photoAlbum).values({ photoId: ids.photo, albumId: ids.org });
});

afterAll(async () => {
	await w?.destroy();
	await pg.end();
});

describe("sign-in-only albums", () => {
	it("are listed for signed-in users and hidden from guests", async () => {
		const guest = await call(router.albums.root, undefined, { context: w.ctx.guest });
		expect(guest.albums.map((a) => a.id)).not.toContain(ids.org);
		const bob = await call(router.albums.root, undefined, { context: w.ctx.bob });
		const tile = bob.albums.find((a) => a.id === ids.org);
		expect(tile).toMatchObject({ isPublic: true, requiresLogin: true, isLinkRequired: false, numPhotos: 1 });
		// Link-required stays unlisted for signed-in users too.
		expect(bob.albums.map((a) => a.id)).not.toContain(ids.orgPwd);

		const guestSearch = await call(router.search.albums, { term: `Org ${w.rand}` }, { context: w.ctx.guest });
		expect(guestSearch).toEqual([]);
		const bobSearch = await call(router.search.albums, { term: `Org ${w.rand}` }, { context: w.ctx.bob });
		expect(bobSearch.map((t) => t.id)).toEqual([ids.org]);
	});

	it("send guests to the login and give signed-in users the public grants", async () => {
		for (const id of [ids.org, ids.orgPwd]) {
			await expect(call(router.albums.head, { id }, { context: w.ctx.guest })).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
		}
		await expect(
			call(router.photos.ratios, { album: ids.org }, { context: w.ctx.guest }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		const head = await call(router.albums.head, { id: ids.org }, { context: w.ctx.bob });
		expect(head.rights).toMatchObject({ canDownload: true, canAccessFullPhoto: true, canEdit: false });
		const ratios = await call(router.photos.ratios, { album: ids.org }, { context: w.ctx.bob });
		expect(ratios.ids).toEqual([ids.photo]);
		// Password still applies on top of sign-in.
		await expect(call(router.albums.head, { id: ids.orgPwd }, { context: w.ctx.bob })).rejects.toMatchObject({
			code: "PASSWORD_REQUIRED",
		});
	});

	it("keep their photos out of guest search and photo details", async () => {
		const guest = await call(router.search.photos, { term: `offsite ${w.rand}` }, { context: w.ctx.guest });
		expect(guest.ids).toEqual([]);
		const bob = await call(router.search.photos, { term: `offsite ${w.rand}` }, { context: w.ctx.bob });
		expect(bob.ids).toEqual([ids.photo]);
		await expect(
			call(router.photos.details, { album: ids.org, ids: [ids.photo] }, { context: w.ctx.guest }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		const details = await call(
			router.photos.details,
			{ album: ids.org, ids: [ids.photo] },
			{ context: w.ctx.bob },
		);
		expect(details.map((d) => d.id)).toEqual([ids.photo]);
	});

	it("cannot be unlocked by a guest, even with the right password", async () => {
		await expect(
			call(router.albums.unlock, { id: ids.orgPwd, password: "secret" }, { context: w.ctx.guest }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("setProtection sets the flag and leaves it unchanged when omitted", async () => {
		const base = {
			id: w.a.priv,
			isPublic: true,
			isLinkRequired: false,
			isNsfw: false,
			grantsFullPhotoAccess: true,
			grantsDownload: false,
			grantsUpload: false,
		};
		const pubRow = async () =>
			(await db.select().from(accessPermissions).where(eq(accessPermissions.albumId, w.a.priv))).find(
				(r) => r.userId === null,
			);
		try {
			// A newly public album without the flag is open to everyone.
			await call(router.albums.setProtection, base, { context: w.ctx.alice });
			expect((await pubRow())?.requiresLogin).toBe(false);

			await call(router.albums.setProtection, { ...base, requiresLogin: true }, { context: w.ctx.alice });
			expect((await pubRow())?.requiresLogin).toBe(true);
			const head = await call(router.albums.head, { id: w.a.priv }, { context: w.ctx.alice });
			expect(head.protection).toMatchObject({ isPublic: true, requiresLogin: true });
			await expect(
				call(router.albums.head, { id: w.a.priv }, { context: w.ctx.guest }),
			).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});

			// Older callers (e.g. toggling sensitive in the edit dialog) do not send the flag: it must survive.
			await call(router.albums.setProtection, { ...base, isNsfw: true }, { context: w.ctx.alice });
			expect((await pubRow())?.requiresLogin).toBe(true);

			await call(router.albums.setProtection, { ...base, requiresLogin: false }, { context: w.ctx.alice });
			const guestHead = await call(router.albums.head, { id: w.a.priv }, { context: w.ctx.guest });
			expect(guestHead.id).toBe(w.a.priv);
		} finally {
			await call(router.albums.setProtection, { ...base, isPublic: false }, { context: w.ctx.alice });
		}
	});
});
