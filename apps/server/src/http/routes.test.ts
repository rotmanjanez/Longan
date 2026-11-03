import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, dbReachable, deleteTestUser, makeJpeg, tempDir } from "../media/test-helpers.ts";

const enabled = await dbReachable();

describe.skipIf(!enabled)("asset / upload / zip routes (dev database)", async () => {
	const { db } = await import("../db/index.ts");
	const schema = await import("../db/schema.ts");
	const { sql } = await import("drizzle-orm");
	const { setStorageRoot } = await import("../media/storage.ts");
	const { registerAssetRoutes } = await import("./asset.ts");
	const { registerUploadRoutes } = await import("./upload.ts");
	const { registerZipRoutes } = await import("./zip.ts");
	const { GUEST } = await import("../policy/index.ts");
	type AppEnv = import("../app.ts").AppEnv;
	type User = import("../db/schema.ts").User;

	let storage: Awaited<ReturnType<typeof tempDir>>;
	let src: Awaited<ReturnType<typeof tempDir>>;
	let owner: User;
	let stranger: User;
	const albumId = "routetest_".padEnd(24, "p");
	let photoId = "";

	/** App whose auth middleware takes the user from the `x-test-user` header (absent = guest). */
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		const id = Number(c.req.header("x-test-user") ?? 0);
		const user = [owner, stranger].find((u) => u?.id === id) ?? null;
		c.set(
			"auth",
			user
				? {
						viewer: {
							userId: user.id,
							isAdmin: user.isAdmin,
							mayUpload: user.mayUpload,
							unlockedAlbumIds: [],
						},
						user,
						sessionId: null,
					}
				: { viewer: GUEST, user: null, sessionId: null },
		);
		await next();
	});
	registerAssetRoutes(app);
	registerUploadRoutes(app);
	registerZipRoutes(app);

	const req = (path: string, init: RequestInit & { as?: User } = {}) => {
		const headers = new Headers(init.headers);
		if (init.as) headers.set("x-test-user", String(init.as.id));
		return app.fetch(new Request(`http://test${path}`, { ...init, headers }));
	};

	beforeAll(async () => {
		storage = await tempDir("longan-routes-");
		src = await tempDir("longan-routes-src-");
		setStorageRoot(storage.dir);
		owner = await createTestUser({ mayUpload: true });
		stranger = await createTestUser({ mayUpload: false });
		await db.insert(schema.albums).values({ id: albumId, ownerId: owner.id, title: "Public, thumbs only" });
		// Public album: visible to everyone, but no full-photo, download or upload grant.
		await db.insert(schema.accessPermissions).values({ albumId, userId: null });
	});

	afterAll(async () => {
		if (owner) await deleteTestUser(owner.id);
		if (stranger) await deleteTestUser(stranger.id);
		await storage.remove();
		await src.remove();
	});

	it("upload: guest without upload grant is refused", async () => {
		const res = await req(`/api/upload?album=${albumId}&name=a.jpg`, { method: "PUT", body: "x" });
		expect(res.status).toBe(401);
	});

	it("upload: user without mayUpload cannot upload to unsorted", async () => {
		const res = await req("/api/upload?name=a.jpg", { method: "PUT", body: "x", as: stranger });
		expect(res.status).toBe(403);
	});

	it("upload: owner uploads into the album, then gets duplicate", async () => {
		const file = join(src.dir, "Sunset.jpg");
		await makeJpeg(file);
		const body = await readFile(file);
		const res = await req(`/api/upload?album=${albumId}&name=Sunset.jpg&mtime=1700000000000`, {
			method: "PUT",
			body,
			as: owner,
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { status: string; photoId: string };
		expect(json.status).toBe("created");
		photoId = json.photoId;
		const again = await req(`/api/upload?album=${albumId}&name=Sunset.jpg`, {
			method: "PUT",
			body,
			as: owner,
		});
		expect(await again.json()).toEqual({ status: "duplicate", photoId });
	});

	it("upload: unsupported file -> 415 with message", async () => {
		const res = await req("/api/upload?name=a.txt", {
			method: "PUT",
			body: "plain text, not an image",
			as: owner,
		});
		expect(res.status).toBe(415);
		const json = (await res.json()) as { status: string; message: string };
		expect(json.status).toBe("error");
		expect(json.message).toMatch(/Unsupported/);
	});

	it("asset: owner gets the original with caching headers, then 304", async () => {
		const res = await req(`/api/asset/${albumId}/${photoId}/original`, { as: owner });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/jpeg");
		expect(res.headers.get("accept-ranges")).toBe("bytes");
		expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
		const etag = res.headers.get("etag")!;
		expect(etag).toBeTruthy();
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(bytes.length).toBe(Number(res.headers.get("content-length")));
		expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

		const cached = await req(`/api/asset/${albumId}/${photoId}/original`, {
			as: owner,
			headers: { "If-None-Match": etag },
		});
		expect(cached.status).toBe(304);
		const since = await req(`/api/asset/${albumId}/${photoId}/original`, {
			as: owner,
			headers: { "If-Modified-Since": res.headers.get("last-modified")! },
		});
		expect(since.status).toBe(304);
		// The cache-busting version query is ignored by the route (same file, same ETag).
		const versioned = await req(`/api/asset/${albumId}/${photoId}/original?v=1700000000`, { as: owner });
		expect(versioned.status).toBe(200);
		expect(versioned.headers.get("etag")).toBe(etag);
		// Versioned urls never change content: cached long-term without revalidation.
		expect(versioned.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
		await versioned.arrayBuffer();
	});

	it("asset: range requests on the original", async () => {
		const res = await req(`/api/asset/${albumId}/${photoId}/original`, {
			as: owner,
			headers: { Range: "bytes=0-99" },
		});
		expect(res.status).toBe(206);
		expect(res.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
		expect((await res.arrayBuffer()).byteLength).toBe(100);
		const bad = await req(`/api/asset/${albumId}/${photoId}/original`, {
			as: owner,
			headers: { Range: "bytes=999999999-" },
		});
		expect(bad.status).toBe(416);
	});

	it("asset: missing variant falls back down the chain", async () => {
		// 1600x1200 source: no medium2x, medium exists.
		const res = await req(`/api/asset/${albumId}/${photoId}/medium2x`, { as: owner });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/webp");
	});

	it("asset: guest sees thumbs of the public album but not full photos or downloads", async () => {
		expect((await req(`/api/asset/${albumId}/${photoId}/thumb`)).status).toBe(200);
		expect((await req(`/api/asset/${albumId}/${photoId}/small2x`)).status).toBe(200);
		expect((await req(`/api/asset/${albumId}/${photoId}/medium`)).status).toBe(403);
		expect((await req(`/api/asset/${albumId}/${photoId}/original`)).status).toBe(403);
		expect((await req(`/api/asset/${albumId}/${photoId}/thumb?download=1`)).status).toBe(403);
	});

	it("asset: owner download sets Content-Disposition", async () => {
		const res = await req(`/api/asset/${albumId}/${photoId}/original?download=1`, { as: owner });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-disposition")).toContain('filename="Sunset.jpg"');
		await res.arrayBuffer();
	});

	it("asset: wrong album context or invisible photo -> 404", async () => {
		expect((await req(`/api/asset/unsorted/${photoId}/thumb`, { as: owner })).status).toBe(404);
		expect((await req(`/api/asset/${"x".repeat(24)}/${photoId}/thumb`, { as: owner })).status).toBe(404);
		expect((await req(`/api/asset/${albumId}/${"y".repeat(24)}/thumb`, { as: owner })).status).toBe(404);
		expect((await req(`/api/asset/${albumId}/${photoId}/bogus`, { as: owner })).status).toBe(400);
		// Once the album is private again, a stranger cannot see the photo at all.
		await db.delete(schema.accessPermissions).where(sql`${schema.accessPermissions.albumId} = ${albumId}`);
		expect((await req(`/api/asset/${albumId}/${photoId}/thumb`, { as: stranger })).status).toBe(404);
		await db.insert(schema.accessPermissions).values({ albumId, userId: null });
	});

	it("zip: owner downloads the album, guest without download grant gets nothing", async () => {
		const res = await req(`/api/zip?albums=${albumId}&variant=medium`, { as: owner });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/zip");
		expect(res.headers.get("content-disposition")).toContain("Public, thumbs only.zip");
		const buf = Buffer.from(await res.arrayBuffer());
		expect(buf.subarray(0, 2).toString()).toBe("PK");
		expect(buf.includes(Buffer.from("Public, thumbs only/Sunset.webp"))).toBe(true);
		expect((await req(`/api/zip?albums=${albumId}`)).status).toBe(404);
	});

	/** Which stored variants of the photo are packed in a ZIP (entries are stored uncompressed). */
	const variantsInZip = async (res: Response) => {
		expect(res.status).toBe(200);
		const buf = Buffer.from(await res.arrayBuffer());
		const rows = await db
			.select({ type: schema.sizeVariants.type, path: schema.sizeVariants.path })
			.from(schema.sizeVariants)
			.where(sql`${schema.sizeVariants.photoId} = ${photoId}`);
		const found: string[] = [];
		for (const r of rows) if (buf.includes(await readFile(join(storage.dir, r.path)))) found.push(r.type);
		return found;
	};
	const setPublicGrants = (grants: { grantsDownload: boolean; grantsFullPhotoAccess: boolean }) =>
		db
			.update(schema.accessPermissions)
			.set(grants)
			.where(
				sql`${schema.accessPermissions.albumId} = ${albumId} and ${schema.accessPermissions.userId} is null`,
			);

	it("zip: download without full-photo grant packs only thumb-class variants", async () => {
		await setPublicGrants({ grantsDownload: true, grantsFullPhotoAccess: false });
		try {
			// 1600x1200 source: original + medium exist, so the largest thumb-class variant is small2x.
			for (const q of [
				`albums=${albumId}`,
				`photos=${photoId}&variant=original`,
				`photos=${photoId}&variant=medium2x`,
				`photos=${photoId}&variant=medium`,
			]) {
				expect(await variantsInZip(await req(`/api/zip?${q}`)), q).toEqual(["small2x"]);
			}
			expect(await variantsInZip(await req(`/api/zip?photos=${photoId}&variant=thumb`))).toEqual(["thumb"]);
		} finally {
			await setPublicGrants({ grantsDownload: false, grantsFullPhotoAccess: false });
		}
	});

	it("zip: download with full-photo grant still packs originals; owner always does", async () => {
		await setPublicGrants({ grantsDownload: true, grantsFullPhotoAccess: true });
		try {
			expect(await variantsInZip(await req(`/api/zip?albums=${albumId}`))).toEqual(["original"]);
			expect(await variantsInZip(await req(`/api/zip?photos=${photoId}&variant=medium2x`))).toEqual([
				"medium",
			]);
		} finally {
			await setPublicGrants({ grantsDownload: false, grantsFullPhotoAccess: false });
		}
		expect(await variantsInZip(await req(`/api/zip?albums=${albumId}`, { as: owner }))).toEqual(["original"]);
		expect(await variantsInZip(await req(`/api/zip?photos=${photoId}`, { as: owner }))).toEqual(["original"]);
	});
});
