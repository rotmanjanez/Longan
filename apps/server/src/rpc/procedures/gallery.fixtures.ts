/**
 * Throwaway gallery data for the procedure tests (dev DB). Every run uses fresh users/tags with a random
 * suffix and removes everything in `destroy()`.
 *
 * alice (uploader) owns:
 *   pub (public, listed; no full-photo grant)  -> child (public), privChild (private)
 *   hidden (public, link required), priv (private), shared (private, shared with bob: edit)
 *   pwd + pwd2 (public, same password "secret"), tagAlbum (tag criteria: tagA)
 * photos: p1,p2,p3 in pub (taken 2024-03-15, 2024-03-01, 2023-07-04), p1 also in priv; p4 in priv;
 *   p5 in shared; p6 in pwd; p7 unsorted; p8 (video) in child. bob owns b1 (unsorted).
 */
import { randomBytes } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
	accessPermissions,
	albums,
	photoAlbum,
	photos,
	photoTags,
	sessions,
	sizeVariants,
	tagAlbumTags,
	tags,
	type User,
	users,
} from "../../db/schema.ts";
import { newId, newSessionId } from "../../lib/ids.ts";
import { GUEST, type Viewer } from "../../policy/index.ts";
import type { Ctx } from "../context.ts";
import { hashPassword } from "./password.ts";

export type World = Awaited<ReturnType<typeof createWorld>>;

export function ctxFor(viewer: Viewer, user: User | null, sessionId: string | null = null): Ctx {
	return { db, viewer, user, sessionId, requestUrl: new URL("http://localhost/api/rpc") };
}

export async function createWorld() {
	const rand = randomBytes(4).toString("hex");
	const [alice, bob] = await db
		.insert(users)
		.values([
			{ sub: `test-alice-${rand}`, username: `alice-${rand}`, displayName: "Alice Test", mayUpload: true },
			{ sub: `test-bob-${rand}`, username: `bob-${rand}`, displayName: "Bob Test" },
		])
		.returning();
	if (!alice || !bob) throw new Error("user insert failed");

	const a = {
		pub: newId(),
		child: newId(),
		privChild: newId(),
		hidden: newId(),
		priv: newId(),
		shared: newId(),
		pwd: newId(),
		pwd2: newId(),
		tagAlbum: newId(),
	};
	const album = (
		id: string,
		title: string,
		parentId: string | null = null,
		kind: "album" | "tag" = "album",
	) => ({
		id,
		title: `${title} ${rand}`,
		parentId,
		kind,
		ownerId: alice.id,
	});
	await db
		.insert(albums)
		.values([album(a.pub, "Public"), album(a.hidden, "Hidden"), album(a.priv, "Private")]);
	await db
		.insert(albums)
		.values([
			album(a.child, "Child", a.pub),
			album(a.privChild, "PrivChild", a.pub),
			album(a.shared, "Shared"),
			album(a.pwd, "Pwd"),
			album(a.pwd2, "Pwd2"),
			album(a.tagAlbum, "Tagged", null, "tag"),
		]);
	const hash1 = await hashPassword("secret");
	const hash2 = await hashPassword("secret");
	await db.insert(accessPermissions).values([
		{ albumId: a.pub, userId: null },
		{ albumId: a.child, userId: null },
		{ albumId: a.hidden, userId: null, isLinkRequired: true, grantsFullPhotoAccess: true },
		{ albumId: a.shared, userId: bob.id, grantsEdit: true, grantsFullPhotoAccess: true },
		{ albumId: a.pwd, userId: null, passwordHash: hash1 },
		{ albumId: a.pwd2, userId: null, passwordHash: hash2, isLinkRequired: true },
		{ albumId: a.tagAlbum, userId: null },
	]);

	const p = {
		p1: newId(),
		p2: newId(),
		p3: newId(),
		p4: newId(),
		p5: newId(),
		p6: newId(),
		p7: newId(),
		p8: newId(),
		b1: newId(),
	};
	const photo = (
		id: string,
		title: string,
		takenAt: string | null,
		extra: Partial<typeof photos.$inferInsert> = {},
	) => ({
		id,
		ownerId: alice.id,
		title: `${title} ${rand}`,
		type: "image" as const,
		mime: "image/jpeg",
		filesize: 1000,
		checksum: randomBytes(20).toString("hex"),
		originalChecksum: randomBytes(20).toString("hex"),
		width: 300,
		height: 200,
		takenAt,
		colours: ["#808080"],
		...extra,
	});
	await db.insert(photos).values([
		photo(p.p1, "Sunset beach", "2024-03-15T10:00:00Z", {
			colours: ["#ff8800", "#112233"],
			make: "Canon",
			model: "EOS R5",
			latitude: 46.05,
			longitude: 14.5,
			license: "CC0",
		}),
		photo(p.p2, "Morning", "2024-03-01T08:00:00Z", { width: 200, height: 300 }),
		photo(p.p3, "Fireworks", "2023-07-04T22:00:00Z", { make: "Nikon" }),
		photo(p.p4, "Secret", "2022-01-01T00:00:00Z"),
		photo(p.p5, "Shared one", "2022-02-02T00:00:00Z"),
		photo(p.p6, "Locked one", "2022-03-03T00:00:00Z"),
		photo(p.p7, "Loose", null),
		photo(p.p8, "Clip", "2024-05-05T00:00:00Z", { type: "video", mime: "video/mp4" }),
		photo(p.b1, "Bob loose", null, { ownerId: bob.id }),
	]);
	await db.insert(photoAlbum).values([
		{ photoId: p.p1, albumId: a.pub },
		{ photoId: p.p2, albumId: a.pub },
		{ photoId: p.p3, albumId: a.pub },
		{ photoId: p.p1, albumId: a.priv },
		{ photoId: p.p4, albumId: a.priv },
		{ photoId: p.p5, albumId: a.shared },
		{ photoId: p.p6, albumId: a.pwd },
		{ photoId: p.p8, albumId: a.child },
	]);
	const variants = Object.values(p).flatMap((photoId) =>
		(["original", "medium", "small", "thumb"] as const).map((type) => ({
			photoId,
			type,
			path: `${type}/xx/yy/${photoId}.jpg`,
			width: 100,
			height: 100,
			filesize: 100,
		})),
	);
	await db.insert(sizeVariants).values(variants);

	const tagNames = { a: `tagA-${rand}`, b: `tagB-${rand}` };
	const [tagA, tagB] = await db
		.insert(tags)
		.values([{ name: tagNames.a }, { name: tagNames.b }])
		.returning();
	if (!tagA || !tagB) throw new Error("tag insert failed");
	await db.insert(photoTags).values([
		{ photoId: p.p1, tagId: tagA.id },
		{ photoId: p.p2, tagId: tagA.id },
		{ photoId: p.p2, tagId: tagB.id },
		{ photoId: p.p4, tagId: tagA.id },
	]);
	await db.insert(tagAlbumTags).values({ albumId: a.tagAlbum, tagId: tagA.id });

	const bobSession = newSessionId();
	await db.insert(sessions).values({
		id: bobSession,
		userId: bob.id,
		expiresAt: new Date(Date.now() + 3600_000).toISOString(),
	});

	const aliceViewer: Viewer = { userId: alice.id, isAdmin: false, mayUpload: true, unlockedAlbumIds: [] };
	const bobViewer: Viewer = { userId: bob.id, isAdmin: false, mayUpload: false, unlockedAlbumIds: [] };
	const ctx = {
		guest: ctxFor(GUEST, null),
		alice: ctxFor(aliceViewer, alice),
		bob: ctxFor(bobViewer, bob, bobSession),
		admin: ctxFor({ ...aliceViewer, isAdmin: true }, alice),
	};

	async function destroy() {
		const ids = [alice!.id, bob!.id];
		await db.delete(albums).where(inArray(albums.ownerId, ids));
		await db.delete(photos).where(inArray(photos.ownerId, ids));
		await db.delete(tags).where(sql`${tags.name} like ${`%-${rand}`}`);
		await db.delete(users).where(inArray(users.id, ids));
		// Deleting photos through the media module queues delete_files jobs for the fake variant paths.
		const patterns = Object.values(p).map((id) => `%/xx/yy/${id}.jpg%`);
		await db.execute(
			sql`delete from jobs where type = 'delete_files' and payload::text like any (${sql.param(patterns)}::text[])`,
		);
	}

	return { rand, alice, bob, a, p, tagA, tagB, tagNames, bobSession, ctx, destroy };
}
