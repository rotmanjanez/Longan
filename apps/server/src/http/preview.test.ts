import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, dbReachable, deleteTestUser } from "../media/test-helpers.ts";

const enabled = await dbReachable();

describe.skipIf(!enabled)("gallery link previews (dev database)", async () => {
	const { db } = await import("../db/index.ts");
	const schema = await import("../db/schema.ts");
	const { env } = await import("../env.ts");
	const { eq } = await import("drizzle-orm");
	const { galleryPreview, withPreview } = await import("./preview.ts");
	type User = import("../db/schema.ts").User;

	let owner: User;
	const id = (tag: string) => `prevtest_${tag}`.padEnd(24, "x");
	const open = id("open");
	const big = id("big");
	const locked = id("locked");
	const signedIn = id("signedin");
	const nsfw = id("nsfw");
	const child = id("nsfwchild");
	const priv = id("private");
	const cover = id("pcover");
	const other = id("pother");
	const heavy = id("pheavy");
	const stray = id("pstray");
	const spicy = id("pspicy");
	const tagged = id("tagged");
	const avif = id("avif");
	const userShare = id("usershare");
	const pAvif = id("pavif");
	const collide = "prevtestcollidexxxxxxxxx";

	beforeAll(async () => {
		owner = await createTestUser();
		await db.insert(schema.albums).values([
			{ id: open, ownerId: owner.id, title: `Holiday "2026" <b>`, description: "Sun,\n\n sea " },
			{ id: big, ownerId: owner.id, title: "Big", slug: "prevtest-big" },
			{ id: locked, ownerId: owner.id, title: "Locked" },
			{ id: signedIn, ownerId: owner.id, title: "Signed in" },
			{ id: nsfw, ownerId: owner.id, title: "NSFW", isNsfw: true },
			{ id: child, ownerId: owner.id, title: "NSFW child", parentId: nsfw },
			{ id: priv, ownerId: owner.id, title: "Private" },
			{ id: tagged, ownerId: owner.id, title: "Tagged", kind: "tag" },
			{ id: avif, ownerId: owner.id, title: "AVIF" },
			{ id: userShare, ownerId: owner.id, title: "Shared with one user" },
			{ id: collide, ownerId: owner.id, title: "Private, id looks like a slug" },
			{ id: id("slugpublic"), ownerId: owner.id, title: "Public, slug looks like an id", slug: collide },
		]);
		await db.insert(schema.accessPermissions).values([
			{ albumId: open, userId: null, isLinkRequired: true },
			{ albumId: big, userId: null },
			{ albumId: locked, userId: null, passwordHash: "x" },
			{ albumId: signedIn, userId: null, requiresLogin: true },
			{ albumId: nsfw, userId: null },
			{ albumId: child, userId: null },
			{ albumId: tagged, userId: null },
			{ albumId: avif, userId: null },
			{ albumId: userShare, userId: owner.id },
			{ albumId: id("slugpublic"), userId: null },
		]);
		const photo = (pid: string) => ({
			id: pid,
			ownerId: owner.id,
			title: pid,
			type: "image" as const,
			mime: "image/jpeg",
			filesize: 1,
			checksum: pid.padEnd(40, "0"),
			originalChecksum: pid.padEnd(40, "0"),
			width: 2000,
			height: 1500,
		});
		await db.insert(schema.photos).values([cover, other, heavy, stray, spicy, pAvif].map(photo));
		await db.update(schema.albums).set({ coverId: other }).where(eq(schema.albums.id, open));
		await db
			.insert(schema.photoAlbum)
			.values([
				{ photoId: cover, albumId: open },
				{ photoId: other, albumId: open },
				{ photoId: heavy, albumId: big },
				{ photoId: spicy, albumId: nsfw },
				{ photoId: pAvif, albumId: avif },
				...[locked, signedIn, priv, userShare, collide].map((albumId) => ({ photoId: cover, albumId })),
			]);
		const [tag] = await db
			.insert(schema.tags)
			.values({ name: `prevtest-${owner.id}` })
			.returning();
		await db.insert(schema.tagAlbumTags).values({ albumId: tagged, tagId: tag!.id });
		await db.insert(schema.photoTags).values([spicy, other].map((photoId) => ({ photoId, tagId: tag!.id })));
		const variant = (
			photoId: string,
			type: "small" | "small2x" | "medium",
			width: number,
			filesize: number,
		) => ({
			photoId,
			type,
			path: `${type}/aa/bb/${photoId}.webp`,
			width,
			height: (width * 3) / 4,
			filesize,
		});
		await db
			.insert(schema.sizeVariants)
			.values([
				variant(cover, "small", 720, 50_000),
				variant(other, "medium", 1920, 200_000),
				variant(other, "small2x", 1440, 150_000),
				variant(other, "small", 720, 50_000),
				variant(heavy, "small2x", 1440, 900_000),
				variant(heavy, "small", 720, 280_000),
				variant(spicy, "small", 720, 50_000),
				{ ...variant(pAvif, "small", 720, 50_000), path: "small/aa/bb/avif.avif" },
			]);
	});

	afterAll(async () => {
		if (owner) {
			await db.delete(schema.tags).where(eq(schema.tags.name, `prevtest-${owner.id}`));
			await deleteTestUser(owner.id);
		}
	});

	const asset = (album: string, photo: string, type: string) =>
		new URL(`/api/asset/${album}/${photo}/${type}`, env.APP_URL).toString();

	it("public albums preview their cover with the largest thumb-class variant within budget", async () => {
		const p = await galleryPreview(`/gallery/${open}`);
		expect(p).toMatchObject({
			title: `Holiday "2026" <b>`,
			description: "Sun, sea",
			url: new URL(`/gallery/${open}`, env.APP_URL).toString(),
			image: { url: asset(open, other, "small2x"), type: "image/webp", width: 1440, height: 1080 },
		});
	});

	it("a photo link previews that photo, but only if it is in the album", async () => {
		expect((await galleryPreview(`/gallery/${open}/${cover}`))?.image?.url).toBe(asset(open, cover, "small"));
		const foreign = await galleryPreview(`/gallery/${open}/${heavy}`);
		expect(foreign?.title).toBe(`Holiday "2026" <b>`);
		expect(foreign?.image).toBeNull();
	});

	it("falls back to the small variant when small2x is too heavy, and resolves slugs", async () => {
		expect((await galleryPreview("/gallery/prevtest-big"))?.image?.url).toBe(asset(big, heavy, "small"));
	});

	it("NSFW albums and their children get a title but no image", async () => {
		expect(await galleryPreview(`/gallery/${nsfw}`)).toMatchObject({ title: "NSFW", image: null });
		expect(await galleryPreview(`/gallery/${child}`)).toMatchObject({ title: "NSFW child", image: null });
	});

	it("tag albums never preview a photo that is also in an NSFW album", async () => {
		expect((await galleryPreview(`/gallery/${tagged}`))?.image?.url).toBe(asset(tagged, other, "small2x"));
		expect(await galleryPreview(`/gallery/${tagged}/${spicy}`)).toMatchObject({
			title: "Tagged",
			image: null,
		});
	});

	it("formats messengers cannot render get no image", async () => {
		expect(await galleryPreview(`/gallery/${avif}`)).toMatchObject({ title: "AVIF", image: null });
	});

	it("albums not open to anonymous visitors get no preview at all", async () => {
		for (const a of [locked, signedIn, priv, userShare, collide, id("missing")])
			expect(await galleryPreview(`/gallery/${a}`)).toBeNull();
		for (const path of ["/", "/gallery/recent", "/gallery/a%27b", `/gallery/${open}/x`, "/search"]) {
			expect(await galleryPreview(path)).toBeNull();
		}
	});

	it("escapes every injected value", async () => {
		const html = withPreview("<html><head><title>Longan</title></head><body></body></html>", {
			title: `"><script>alert(1)</script>$&`,
			description: "a & b",
			url: "https://x/gallery/a",
			siteName: "Longan",
			image: null,
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("<title>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;$&amp;</title>");
		expect(html).toContain('<meta property="og:description" content="a &amp; b" />');
		expect(html).toContain('<meta name="twitter:card" content="summary" />');
		expect(html.indexOf("og:title")).toBeLessThan(html.indexOf("</head>"));
	});
});
