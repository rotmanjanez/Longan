/** Shared fixtures for media/http integration tests (not a test file itself). */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

try {
	process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
} catch {
	// no .env: rely on the environment
}

export const dbConfigured = Boolean(
	process.env.DATABASE_URL &&
		process.env.SESSION_SECRET &&
		process.env.OIDC_ISSUER &&
		process.env.OIDC_CLIENT_ID,
);

export async function dbReachable(): Promise<boolean> {
	if (!dbConfigured) return false;
	try {
		const { sql } = await import("../db/index.ts");
		await sql`select 1`;
		return true;
	} catch {
		return false;
	}
}

/** A JPEG with two colour halves, EXIF (camera, date+offset, GPS) and EXIF orientation 6 (rotate 90 cw). */
export async function makeJpeg(path: string, width = 1600, height = 1200) {
	const left = await sharp({ create: { width: width / 2, height, channels: 3, background: "#d01010" } })
		.png()
		.toBuffer();
	await sharp({ create: { width, height, channels: 3, background: "#1030c0" } })
		.composite([{ input: left, left: 0, top: 0 }])
		.withExif({
			IFD0: { Make: "Canon", Model: "EOS R5" },
			IFD2: {
				DateTimeOriginal: "2023:05:01 12:34:56",
				OffsetTimeOriginal: "+02:00",
				FNumber: "28/10",
				ExposureTime: "1/250",
				ISOSpeedRatings: "400",
				FocalLength: "24/1",
				LensModel: "RF24-70mm F2.8 L IS USM",
			},
			IFD3: {
				GPSLatitudeRef: "N",
				GPSLatitude: "48/1 51/1 2964/100",
				GPSLongitudeRef: "E",
				GPSLongitude: "2/1 17/1 4000/100",
			},
		})
		.withMetadata({ orientation: 6 })
		.jpeg({ quality: 90 })
		.toFile(path);
}

export async function tempDir(prefix: string) {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
}

export async function createTestUser(opts: { isAdmin?: boolean; mayUpload?: boolean } = {}) {
	const { db } = await import("../db/index.ts");
	const { users } = await import("../db/schema.ts");
	const tag = `test-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const [u] = await db
		.insert(users)
		.values({
			sub: tag,
			username: tag,
			displayName: "Media Test",
			isAdmin: opts.isAdmin ?? false,
			mayUpload: opts.mayUpload ?? true,
		})
		.returning();
	return u!;
}

/** Delete a test user with everything it owns (photos, albums) and its queued file jobs. */
export async function deleteTestUser(userId: number) {
	const { db } = await import("../db/index.ts");
	const { albums, photos, users } = await import("../db/schema.ts");
	const { eq } = await import("drizzle-orm");
	await db.delete(photos).where(eq(photos.ownerId, userId));
	await db.delete(albums).where(eq(albums.ownerId, userId));
	await db.delete(users).where(eq(users.id, userId));
}
