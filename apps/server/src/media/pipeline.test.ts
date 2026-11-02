import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, dbReachable, deleteTestUser, makeJpeg, tempDir } from "./test-helpers.ts";

const enabled = await dbReachable();

async function listFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (e.isFile()) out.push(join(e.parentPath, e.name));
	}
	return out;
}

describe.skipIf(!enabled)("importFile (dev database)", async () => {
	const { db } = await import("../db/index.ts");
	const schema = await import("../db/schema.ts");
	const { eq, and, sql } = await import("drizzle-orm");
	const { setStorageRoot, absPath } = await import("./storage.ts");
	const { importFile, deletePhotos, rotatePhoto, reprocessPhoto, MediaError } = await import("./pipeline.ts");
	const { jobHandler } = await import("../jobs/worker.ts");

	let storage: Awaited<ReturnType<typeof tempDir>>;
	let src: Awaited<ReturnType<typeof tempDir>>;
	let userId = 0;
	let albumId = "";

	beforeAll(async () => {
		storage = await tempDir("longan-storage-");
		src = await tempDir("longan-src-");
		setStorageRoot(storage.dir);
		const user = await createTestUser();
		userId = user.id;
		albumId = "testalbum_".padEnd(24, "x");
		await db.insert(schema.albums).values({ id: albumId, ownerId: userId, title: "Pipeline test" });
	});

	afterAll(async () => {
		if (userId) await deleteTestUser(userId);
		await storage.remove();
		await src.remove();
	});

	let photoId = "";

	it("imports a JPEG with metadata, variants, colours and placeholder", async () => {
		const file = join(src.dir, "IMG_0001.jpg");
		await makeJpeg(file);
		const res = await importFile({
			tmpPath: file,
			originalName: "IMG_0001.jpg",
			albumId,
			ownerId: userId,
			copy: true,
		});
		expect(res.status).toBe("created");
		photoId = res.photoId;
		await stat(file); // copy mode leaves the source

		const [p] = await db.select().from(schema.photos).where(eq(schema.photos.id, photoId));
		expect(p).toMatchObject({
			title: "IMG_0001",
			type: "image",
			mime: "image/jpeg",
			// orientation 6: display size is portrait
			width: 1200,
			height: 1600,
			make: "Canon",
			model: "EOS R5",
			lens: "RF24-70mm F2.8 L IS USM",
			iso: "400",
			aperture: "f/2.8",
			shutter: "1/250",
			focal: "24 mm",
			takenAtTz: "+02:00",
		});
		expect(new Date(p!.takenAt!).toISOString()).toBe("2023-05-01T10:34:56.000Z");
		expect(p!.latitude).toBeCloseTo(48.8582, 3);
		expect(p!.longitude).toBeCloseTo(2.2944, 3);
		expect(p!.checksum).toMatch(/^[0-9a-f]{40}$/);
		expect(p!.originalChecksum).toBe(p!.checksum);
		expect(p!.colours.length).toBeGreaterThanOrEqual(2);
		expect(p!.colours[0]).toMatch(/^#[0-9a-f]{6}$/);
		expect(p!.placeholder).toBeTruthy();
		expect(Buffer.from(p!.placeholder!, "base64").subarray(8, 12).toString()).toBe("WEBP");

		const variants = await db
			.select()
			.from(schema.sizeVariants)
			.where(eq(schema.sizeVariants.photoId, photoId));
		const byType = Object.fromEntries(variants.map((v) => [v.type, v]));
		expect(Object.keys(byType).sort()).toEqual([
			"medium",
			"original",
			"small",
			"small2x",
			"thumb",
			"thumb2x",
		]);
		expect(byType.original).toMatchObject({ width: 1200, height: 1600 });
		expect(byType.medium).toMatchObject({ width: 1200, height: 1600 });
		expect(byType.small).toMatchObject({ width: 540, height: 720 });
		expect(byType.small2x).toMatchObject({ width: 1080, height: 1440 });
		expect(byType.thumb).toMatchObject({ width: 200, height: 200 });
		expect(byType.thumb2x).toMatchObject({ width: 400, height: 400 });
		expect(byType.original!.path).toMatch(/^original\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{28}\.jpg$/);
		const stem = byType
			.original!.path.split("/")
			.slice(1)
			.join("/")
			.replace(/\.jpg$/, "");
		for (const v of variants) {
			expect(v.path.startsWith(`${v.type}/`)).toBe(true);
			expect(v.path).toContain(stem);
			const s = await stat(absPath(v.path));
			expect(s.size).toBe(v.filesize);
		}
		expect(byType.thumb!.path.endsWith(".webp")).toBe(true);

		const links = await db.select().from(schema.photoAlbum).where(eq(schema.photoAlbum.photoId, photoId));
		expect(links).toEqual([{ photoId, albumId }]);
	});

	it("returns duplicate for the same bytes and links into a new album", async () => {
		const other = "testalbum2".padEnd(24, "y");
		await db.insert(schema.albums).values({ id: other, ownerId: userId, title: "Second" });
		const file = join(src.dir, "IMG_0001.jpg");
		const res = await importFile({
			tmpPath: file,
			originalName: "copy.jpg",
			albumId: other,
			ownerId: userId,
			copy: true,
		});
		expect(res).toEqual({ status: "duplicate", photoId });
		const links = await db
			.select()
			.from(schema.photoAlbum)
			.where(and(eq(schema.photoAlbum.photoId, photoId), eq(schema.photoAlbum.albumId, other)));
		expect(links).toHaveLength(1);
	});

	it("rejects unsupported and undecodable files without leaving files behind", async () => {
		const stored = async () =>
			(await listFiles(storage.dir)).filter((f) => !f.startsWith(join(storage.dir, "tmp"))).length;
		const before = await stored();
		const txt = join(src.dir, "notes.txt");
		await writeFile(txt, "hello world, definitely not an image");
		await expect(
			importFile({ tmpPath: txt, originalName: "notes.txt", albumId: null, ownerId: userId, copy: true }),
		).rejects.toBeInstanceOf(MediaError);
		const broken = join(src.dir, "broken.jpg");
		await writeFile(broken, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]));
		await expect(
			importFile({ tmpPath: broken, originalName: "broken.jpg", albumId: null, ownerId: userId, copy: true }),
		).rejects.toBeInstanceOf(MediaError);
		expect(await stored()).toBe(before);
	});

	it("rotates in place and reprocesses selected variants", async () => {
		const before = await db
			.select()
			.from(schema.sizeVariants)
			.where(eq(schema.sizeVariants.photoId, photoId));
		await rotatePhoto(db, photoId, "cw");
		const [p] = await db.select().from(schema.photos).where(eq(schema.photos.id, photoId));
		expect(p).toMatchObject({ width: 1600, height: 1200 });
		expect(p!.checksum).not.toBe(p!.originalChecksum);
		const after = await db.select().from(schema.sizeVariants).where(eq(schema.sizeVariants.photoId, photoId));
		const pathOf = (rows: typeof after, t: string) => rows.find((r) => r.type === t)?.path;
		for (const t of ["original", "medium", "small", "thumb"])
			expect(pathOf(after, t)).toBe(pathOf(before, t));
		expect(after.find((r) => r.type === "small")).toMatchObject({ width: 720, height: 540 });
		const { readImageMetadata } = await import("./metadata.ts");
		const meta = await readImageMetadata(absPath(pathOf(after, "original")!));
		expect(meta.make).toBe("Canon");
		expect(meta.orientation ?? 1).toBe(1);

		expect(await reprocessPhoto(db, photoId, ["thumb"])).toBe(1);
		const again = await db.select().from(schema.sizeVariants).where(eq(schema.sizeVariants.photoId, photoId));
		expect(again).toHaveLength(after.length);
	});

	it("deletes rows and queues file removal", async () => {
		const variants = await db
			.select()
			.from(schema.sizeVariants)
			.where(eq(schema.sizeVariants.photoId, photoId));
		expect(await deletePhotos(db, [photoId])).toBe(1);
		expect(await db.select().from(schema.photos).where(eq(schema.photos.id, photoId))).toHaveLength(0);
		const [job] = await db
			.select()
			.from(schema.jobs)
			.where(
				and(
					eq(schema.jobs.type, "delete_files"),
					sql`${schema.jobs.payload}->'paths' ? ${variants[0]!.path}`,
				),
			);
		expect(job).toBeTruthy();
		const handler = await jobHandler("delete_files");
		await handler!(job!.payload, job!);
		await db.delete(schema.jobs).where(eq(schema.jobs.id, job!.id));
		for (const v of variants) await expect(stat(absPath(v.path))).rejects.toThrow();
	});
});
