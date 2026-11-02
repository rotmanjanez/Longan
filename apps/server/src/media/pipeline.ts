import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { SizeVariantType } from "@longan/shared";
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import sharp from "sharp";
import { type Db, db as defaultDb, type Tx } from "../db/index.ts";
import { albums, photoAlbum, photos, sizeVariants } from "../db/schema.ts";
import { enqueue } from "../jobs/worker.ts";
import { newId } from "../lib/ids.ts";
import { log } from "../lib/log.ts";
import { albumGrant, type Viewer } from "../policy/index.ts";
import { settingBool } from "../settings/index.ts";
import { extractColours } from "./colours.ts";
import { EMPTY_METADATA, type MediaMetadata, readImageMetadata, readVideoMetadata } from "./metadata.ts";
import { MediaError, type Sniffed, sniffFile } from "./sniff.ts";
import {
	absPath,
	copyInto,
	moveFile,
	newStem,
	pruneEmptyDirs,
	safeUnlink,
	stemFromPath,
	tmpFile,
	variantPath,
} from "./storage.ts";
import {
	convertHeicToJpeg,
	GENERATED_VARIANTS,
	generateVariants,
	imageSize,
	makePlaceholder,
	readImageSettings,
	type VariantRow,
} from "./variants.ts";
import { extractFrame } from "./video.ts";

export { MediaError } from "./sniff.ts";

/** Refused import (target album missing or not writable for the viewer). */
export class ImportError extends Error {
	code: "NOT_FOUND" | "FORBIDDEN";
	constructor(code: "NOT_FOUND" | "FORBIDDEN", message: string) {
		super(message);
		this.name = "ImportError";
		this.code = code;
	}
}

export type ImportInput = {
	/** File to import. Moved into storage unless `copy` is set; the caller removes leftovers. */
	tmpPath: string;
	originalName: string;
	/** Client-reported last-modified time (ms). Informational only: taken_at stays null without metadata. */
	mtime?: number | null;
	albumId: string | null;
	ownerId: number;
	/** When given, the viewer must be allowed to upload into the album (or have mayUpload for unsorted). */
	viewer?: Viewer | null;
	/** Copy the source instead of moving it (CLI sync). */
	copy?: boolean;
	db?: Db;
};

export type ImportResult = { status: "created" | "duplicate" | "skipped"; photoId: string };

export function sha1File(path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const h = createHash("sha1");
		createReadStream(path)
			.on("data", (chunk) => h.update(chunk))
			.on("error", reject)
			.on("end", () => resolve(h.digest("hex")));
	});
}

export function titleFromName(name: string): string {
	const base = basename(name.replace(/\\/g, "/"));
	const ext = extname(base);
	const t = (ext ? base.slice(0, -ext.length) : base).trim();
	return t || base || "Untitled";
}

async function findDuplicate(db: Db | Tx, ownerId: number, checksum: string): Promise<string | null> {
	const [row] = await db
		.select({ id: photos.id })
		.from(photos)
		.where(
			and(
				eq(photos.ownerId, ownerId),
				or(eq(photos.originalChecksum, checksum), eq(photos.checksum, checksum)),
			),
		)
		.limit(1);
	return row?.id ?? null;
}

async function linkToAlbum(db: Db | Tx, photoId: string, albumId: string | null) {
	if (!albumId) return;
	await db.insert(photoAlbum).values({ photoId, albumId }).onConflictDoNothing();
}

async function checkTarget(db: Db, albumId: string | null, viewer: Viewer | null | undefined) {
	if (albumId) {
		const [album] = await db
			.select({
				id: albums.id,
				kind: albums.kind,
				mayUpload: viewer ? albumGrant(viewer, "grantsUpload") : sql<boolean>`true`,
			})
			.from(albums)
			.where(eq(albums.id, albumId));
		if (album?.kind !== "album") throw new ImportError("NOT_FOUND", "Album not found");
		if (!album.mayUpload) throw new ImportError("FORBIDDEN", "Not allowed to upload into this album");
	} else if (viewer && !(viewer.isAdmin || (viewer.userId !== null && viewer.mayUpload))) {
		throw new ImportError("FORBIDDEN", "Not allowed to upload");
	}
}

async function readMetadata(path: string, kind: Sniffed["kind"]): Promise<MediaMetadata> {
	try {
		return kind === "video" ? await readVideoMetadata(path) : await readImageMetadata(path);
	} catch (err) {
		log.warn("metadata extraction failed", { path, err: String(err) });
		return { ...EMPTY_METADATA };
	}
}

async function cleanup(rels: Iterable<string>) {
	for (const rel of rels) {
		try {
			const abs = absPath(rel);
			await safeUnlink(abs);
			await pruneEmptyDirs(abs);
		} catch (err) {
			log.warn("cleanup failed", { rel, err: String(err) });
		}
	}
}

/**
 * Import one file: sniff -> sha1 -> duplicate check -> metadata -> place original -> variants -> colours ->
 * placeholder -> one transaction inserting photo + size variants + album link.
 * Throws MediaError for unsupported/undecodable input and ImportError for refused targets.
 * On failure nothing is left behind (rows or files).
 */
export async function importFile(input: ImportInput): Promise<ImportResult> {
	const db = input.db ?? defaultDb;
	const { tmpPath, albumId, ownerId } = input;
	await checkTarget(db, albumId, input.viewer);

	const sniffed = await sniffFile(tmpPath, input.originalName);
	const originalChecksum = await sha1File(tmpPath);
	const skipDuplicates = await settingBool("upload.skip_duplicates", true);

	if (skipDuplicates) {
		const dup = await findDuplicate(db, ownerId, originalChecksum);
		if (dup) {
			await linkToAlbum(db, dup, albumId);
			return { status: "duplicate", photoId: dup };
		}
	}

	const meta = await readMetadata(tmpPath, sniffed.kind);
	const s = await readImageSettings();
	const stem = newStem();
	const written = new Set<string>();
	let frame: string | null = null;

	try {
		// Place the original. HEIC/HEIF becomes an autorotated JPEG; the HEIC bytes are not kept.
		const isHeic = sniffed.format === "heic";
		const ext = isHeic ? "jpg" : sniffed.ext;
		const mime = isHeic ? "image/jpeg" : sniffed.mime;
		const originalRel = variantPath("original", stem, ext);
		const originalAbs = absPath(originalRel);
		written.add(originalRel);
		if (isHeic) {
			try {
				await convertHeicToJpeg(tmpPath, originalAbs);
			} catch (err) {
				throw new MediaError(
					`Could not decode HEIC/HEIF image (HEVC needs libheif's heif-dec on the server): ${String(err)}`,
				);
			}
		} else if (input.copy) {
			await copyInto(tmpPath, originalAbs);
		} else {
			await moveFile(tmpPath, originalAbs);
		}
		const checksum = isHeic ? await sha1File(originalAbs) : originalChecksum;
		const filesize = (await stat(originalAbs)).size;

		// Image source for variants, colours and placeholder.
		let source: string | null = originalAbs;
		if (sniffed.kind === "video") {
			frame = await extractFrame(originalAbs, meta.duration);
			source = frame;
			if (!frame)
				log.warn("no video frame: importing video without thumbnails", { name: input.originalName });
		}

		let width = meta.width ?? 0;
		let height = meta.height ?? 0;
		if (sniffed.kind === "image") {
			try {
				({ width, height } = await imageSize(originalAbs));
			} catch (err) {
				throw new MediaError(`Could not decode image: ${String(err)}`);
			}
		} else if ((!width || !height) && frame) {
			({ width, height } = await imageSize(frame));
		}

		let variants: VariantRow[] = [];
		let colours: string[] = [];
		let placeholder: string | null = null;
		if (source) {
			variants = await generateVariants({ source, stem, settings: s, onWrite: (rel) => written.add(rel) });
			colours = await extractColours(source).catch((err) => {
				log.warn("colour extraction failed", { err: String(err) });
				return [] as string[];
			});
			if (s.placeholder) placeholder = await makePlaceholder(source);
		}

		const photoId = newId();
		const dupInTx = await db.transaction(async (tx) => {
			// Serialise concurrent imports of identical bytes for the same owner.
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ownerId}:${originalChecksum}`}))`);
			if (skipDuplicates) {
				const dup = await findDuplicate(tx, ownerId, originalChecksum);
				if (dup) {
					await linkToAlbum(tx, dup, albumId);
					return dup;
				}
			}
			await tx.insert(photos).values({
				id: photoId,
				ownerId,
				title: titleFromName(input.originalName),
				type: sniffed.kind,
				mime,
				filesize,
				checksum,
				originalChecksum,
				width,
				height,
				takenAt: meta.takenAt,
				takenAtTz: meta.takenAtTz,
				make: meta.make,
				model: meta.model,
				lens: meta.lens,
				iso: meta.iso,
				aperture: meta.aperture,
				shutter: meta.shutter,
				focal: meta.focal,
				latitude: meta.latitude,
				longitude: meta.longitude,
				altitude: meta.altitude,
				duration: meta.duration,
				fps: meta.fps,
				colours,
				placeholder,
			});
			await tx
				.insert(sizeVariants)
				.values([
					{ photoId, type: "original", path: originalRel, width, height, filesize },
					...variants.map((v) => ({ photoId, ...v })),
				]);
			await linkToAlbum(tx, photoId, albumId);
			return null;
		});
		if (dupInTx) {
			await cleanup(written);
			return { status: "duplicate", photoId: dupInTx };
		}
		return { status: "created", photoId };
	} catch (err) {
		await cleanup(written);
		throw err;
	} finally {
		if (frame) await safeUnlink(frame);
	}
}

/** Delete photos (rows in one transaction) and queue a delete_files job for their files. */
export async function deletePhotos(db: Db, ids: string[]): Promise<number> {
	if (ids.length === 0) return 0;
	return db.transaction(async (tx) => {
		const files = await tx
			.select({ path: sizeVariants.path })
			.from(sizeVariants)
			.where(inArray(sizeVariants.photoId, ids));
		const deleted = await tx.delete(photos).where(inArray(photos.id, ids)).returning({ id: photos.id });
		if (files.length > 0) await enqueue(tx, "delete_files", { paths: files.map((f) => f.path) });
		return deleted.length;
	});
}

async function loadOriginal(db: Db, photoId: string) {
	const [photo] = await db.select().from(photos).where(eq(photos.id, photoId));
	if (!photo) throw new Error(`photo ${photoId} not found`);
	const [original] = await db
		.select()
		.from(sizeVariants)
		.where(and(eq(sizeVariants.photoId, photoId), eq(sizeVariants.type, "original")));
	if (!original) throw new Error(`photo ${photoId} has no original`);
	return { photo, original };
}

/**
 * Regenerate generated size variants of a photo from its original (videos: from a fresh frame).
 * Without `variants` all generated variants, colours, placeholder and the image dimensions are refreshed.
 */
export async function reprocessPhoto(db: Db, photoId: string, variants?: SizeVariantType[]): Promise<number> {
	const { photo, original } = await loadOriginal(db, photoId);
	const originalAbs = absPath(original.path);
	await stat(originalAbs); // throws if the original is missing
	const full = !variants || variants.length === 0;
	const types = full ? [...GENERATED_VARIANTS] : variants.filter((t) => t !== "original");
	if (types.length === 0) return 0;
	const stem = stemFromPath(original.path) ?? newStem();
	const s = await readImageSettings();
	let frame: string | null = null;
	const written = new Set<string>();
	try {
		let source: string | null = originalAbs;
		if (photo.type === "video") {
			frame = await extractFrame(originalAbs, photo.duration);
			source = frame;
		}
		if (!source) return 0;
		const old = await db
			.select({ path: sizeVariants.path })
			.from(sizeVariants)
			.where(and(eq(sizeVariants.photoId, photoId), inArray(sizeVariants.type, types)));
		const rows = await generateVariants({
			source,
			stem,
			settings: s,
			only: types,
			onWrite: (r) => written.add(r),
		});
		let extra: Partial<typeof photos.$inferInsert> = {};
		if (full) {
			const colours = await extractColours(source).catch(() => photo.colours);
			const placeholder = s.placeholder ? await makePlaceholder(source) : null;
			extra = { colours, placeholder };
			if (photo.type === "image") {
				const dims = await imageSize(originalAbs);
				extra.width = dims.width;
				extra.height = dims.height;
			}
		}
		await db.transaction(async (tx) => {
			await tx
				.delete(sizeVariants)
				.where(and(eq(sizeVariants.photoId, photoId), inArray(sizeVariants.type, types)));
			if (rows.length > 0) await tx.insert(sizeVariants).values(rows.map((r) => ({ photoId, ...r })));
			// Always bump updated_at: clients use it as the cache-busting version of the asset urls.
			await tx
				.update(photos)
				.set({ ...extra, updatedAt: sql`now()` })
				.where(eq(photos.id, photoId));
			if (full) {
				if (extra.width && extra.height) {
					await tx
						.update(sizeVariants)
						.set({ width: extra.width, height: extra.height })
						.where(and(eq(sizeVariants.photoId, photoId), eq(sizeVariants.type, "original")));
				}
			}
		});
		const kept = new Set(rows.map((r) => r.path));
		await cleanup(old.map((o) => o.path).filter((p) => !kept.has(p)));
		return rows.length;
	} catch (err) {
		await cleanup(written);
		throw err;
	} finally {
		if (frame) await safeUnlink(frame);
	}
}

/** Rotate the original image by 90 degrees and regenerate all variants at the same paths. */
export async function rotatePhoto(
	db: Db,
	photoId: string,
	direction: "cw" | "ccw" | 90 | -90,
): Promise<void> {
	const { photo, original } = await loadOriginal(db, photoId);
	if (photo.type !== "image") throw new MediaError("Only images can be rotated");
	const angle = direction === "cw" || direction === 90 ? 90 : 270;
	const originalAbs = absPath(original.path);
	const ext = extname(original.path);
	const tmp = await tmpFile(ext);
	try {
		let img = sharp(originalAbs, { failOn: "none", animated: false })
			.autoOrient()
			.rotate(angle)
			.keepIccProfile();
		if (ext !== ".tif" && ext !== ".tiff") img = img.keepExif();
		if (ext === ".jpg" || ext === ".jpeg") img = img.jpeg({ quality: 95 });
		await img.toFile(tmp);
		await moveFile(tmp, originalAbs);
	} finally {
		await safeUnlink(tmp);
	}
	const checksum = await sha1File(originalAbs);
	const filesize = (await stat(originalAbs)).size;
	const { width, height } = await imageSize(originalAbs);
	await db.transaction(async (tx) => {
		await tx
			.update(photos)
			.set({ checksum, filesize, width, height, updatedAt: sql`now()` })
			.where(eq(photos.id, photoId));
		await tx
			.update(sizeVariants)
			.set({ filesize, width, height })
			.where(and(eq(sizeVariants.photoId, photoId), eq(sizeVariants.type, "original")));
	});
	await reprocessPhoto(db, photoId);
}

/** Ids of photos that have no generated variants (used by doctor). */
export async function photosWithoutVariants(db: Db): Promise<string[]> {
	const rows = await db
		.select({ id: photos.id })
		.from(photos)
		.where(
			sql`not exists (select 1 from ${sizeVariants} where ${sizeVariants.photoId} = ${photos.id} and ${notInArray(sizeVariants.type, ["original"])})`,
		);
	return rows.map((r) => r.id);
}
