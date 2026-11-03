import { createHash } from "node:crypto";
import { createReadStream, openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { ID_RE, isSmartAlbumId, SizeVariantType, THUMB_CLASS_VARIANTS } from "@longan/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { type AppEnv, addHttpRoutes } from "../app.ts";
import { db } from "../db/index.ts";
import { albums, photoAlbum, photos, sizeVariants } from "../db/schema.ts";
import { log } from "../lib/log.ts";
import { absPath } from "../media/storage.ts";
import { albumAccessible, photoGrant, photoVisible, type Viewer } from "../policy/index.ts";
import { contentDisposition, EXT_MIME, extOf, jsonError, safeName } from "./common.ts";

/** Fallback chain for display variants (each entry falls back to the ones after it). */
const CHAIN: SizeVariantType[] = ["medium2x", "medium", "small2x", "small", "thumb2x", "thumb"];

type PhotoRow = { id: string; ownerId: number; inAlbum: boolean };

/** Whether the album context in the URL allows serving this (already visible) photo. */
async function contextAllows(viewer: Viewer, albumCtx: string, photo: PhotoRow): Promise<boolean> {
	if (albumCtx === "unsorted") {
		return !photo.inAlbum && (viewer.isAdmin || (viewer.userId !== null && viewer.userId === photo.ownerId));
	}
	// Other smart contexts (incl. `timeline`, which search results use) only require the photo to be visible,
	// which the caller has already checked: a visible photo's variants leak nothing about where it lives.
	if (isSmartAlbumId(albumCtx)) return true;
	const [album] = await db
		.select({
			kind: albums.kind,
			linked: sql<boolean>`exists (select 1 from ${photoAlbum} where ${photoAlbum.albumId} = ${albums.id} and ${photoAlbum.photoId} = ${photo.id})`,
		})
		.from(albums)
		.where(and(eq(albums.id, albumCtx), albumAccessible(viewer)));
	if (!album) return false;
	// Tag albums compute their photos from tags; visibility of the photo is checked separately.
	return album.kind === "tag" || album.linked;
}

function parseRange(header: string, size: number): { start: number; end: number } | "invalid" | null {
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m) return null; // unsupported (e.g. multi-range): serve the whole file
	const [, a, b] = m;
	if (a === "" && b === "") return "invalid";
	let start: number;
	let end: number;
	if (a === "") {
		const suffix = Number(b);
		if (suffix === 0) return "invalid";
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(a);
		end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
	}
	if (start >= size || start > end) return "invalid";
	return { start, end };
}

function etagMatches(header: string | undefined, etag: string): boolean {
	if (!header) return false;
	if (header.trim() === "*") return true;
	const bare = etag.replace(/^W\//, "");
	return header.split(",").some((t) => t.trim().replace(/^W\//, "") === bare);
}

/**
 * Versioned urls (`?v=<updated_at>`, bumped by rotate/reprocess) never change content, so browsers may keep
 * them without revalidating. Unversioned urls are revalidated hourly. `private`: assets are access-checked.
 */
export function cacheControl(version: string | undefined): string {
	return version && /^\d+$/.test(version) ? "private, max-age=31536000, immutable" : "private, max-age=3600";
}

const IS_BUN = Boolean((process.versions as Record<string, string | undefined>).bun);

/**
 * Response body for (part of) a file. Bun drops Content-Length on stream bodies but serves file-backed
 * Blobs natively; @hono/node-server buffers Blobs in memory, so Node gets a file stream instead.
 */
async function fileBody(abs: string, range?: { start: number; end: number }): Promise<Blob | ReadableStream> {
	if (IS_BUN) {
		const blob = await openAsBlob(abs);
		return range ? blob.slice(range.start, range.end + 1) : blob;
	}
	const stream = createReadStream(abs, range ? { start: range.start, end: range.end } : {});
	return Readable.toWeb(stream) as ReadableStream;
}

async function serveAsset(c: Context<AppEnv>) {
	const { album: albumCtx, photo: photoId, variant: variantParam } = c.req.param() as Record<string, string>;
	const parsed = SizeVariantType.safeParse(variantParam);
	if (!parsed.success) return jsonError(c, 400, "BAD_REQUEST", "unknown size variant");
	const requested = parsed.data;
	if (!ID_RE.test(photoId ?? "") || !(isSmartAlbumId(albumCtx ?? "") || ID_RE.test(albumCtx ?? ""))) {
		return jsonError(c, 404, "NOT_FOUND", "not found");
	}
	const { viewer } = c.get("auth");
	const download = c.req.query("download") === "1";

	const [photo] = await db
		.select({
			id: photos.id,
			ownerId: photos.ownerId,
			title: photos.title,
			mime: photos.mime,
			visible: photoVisible(viewer),
			fullAccess: photoGrant(viewer, "grantsFullPhotoAccess"),
			mayDownload: photoGrant(viewer, "grantsDownload"),
			inAlbum: sql<boolean>`exists (select 1 from ${photoAlbum} where ${photoAlbum.photoId} = ${photos.id})`,
		})
		.from(photos)
		.where(eq(photos.id, photoId!));
	if (!photo?.visible || !(await contextAllows(viewer, albumCtx!, photo))) {
		return jsonError(c, 404, "NOT_FOUND", "not found");
	}
	if (!THUMB_CLASS_VARIANTS.includes(requested) && !photo.fullAccess) {
		return jsonError(c, 403, "FORBIDDEN", "full photo access not granted");
	}
	if (download && !photo.mayDownload) return jsonError(c, 403, "FORBIDDEN", "download not granted");

	const rows = await db
		.select({ type: sizeVariants.type, path: sizeVariants.path })
		.from(sizeVariants)
		.where(eq(sizeVariants.photoId, photo.id));
	const byType = new Map(rows.map((r) => [r.type, r.path]));
	const candidates = requested === "original" ? ["original" as const] : CHAIN.slice(CHAIN.indexOf(requested));
	const chosen = candidates.find((t) => byType.has(t));
	if (!chosen) return jsonError(c, 404, "NOT_FOUND", "size variant not available");
	const rel = byType.get(chosen)!;
	const abs = absPath(rel);
	let st: Awaited<ReturnType<typeof stat>>;
	try {
		st = await stat(abs);
	} catch {
		log.warn("asset file missing", { photoId: photo.id, path: rel });
		return jsonError(c, 404, "NOT_FOUND", "file missing");
	}

	const ext = extOf(rel);
	const etag = `"${createHash("sha1").update(`${rel}:${st.mtimeMs}:${st.size}`).digest("hex").slice(0, 32)}"`;
	const lastModified = new Date(Math.floor(st.mtimeMs / 1000) * 1000);
	const headers = new Headers({
		"Cache-Control": cacheControl(c.req.query("v")),
		ETag: etag,
		"Last-Modified": lastModified.toUTCString(),
		"X-Content-Type-Options": "nosniff",
	});
	if (chosen === "original") headers.set("Accept-Ranges", "bytes");
	if (download) {
		const suffix = chosen === "original" ? "" : `-${chosen}`;
		headers.set("Content-Disposition", contentDisposition(`${safeName(photo.title)}${suffix}.${ext}`));
	}

	const inm = c.req.header("if-none-match");
	const ims = c.req.header("if-modified-since");
	const notModified = inm
		? etagMatches(inm, etag)
		: ims !== undefined && !Number.isNaN(Date.parse(ims)) && Date.parse(ims) >= lastModified.getTime();
	if (notModified) return new Response(null, { status: 304, headers });

	headers.set(
		"Content-Type",
		chosen === "original" ? photo.mime : (EXT_MIME[ext] ?? "application/octet-stream"),
	);
	let status = 200;
	let range: { start: number; end: number } | undefined;
	const rangeHeader = c.req.header("range");
	const ifRange = c.req.header("if-range");
	if (chosen === "original" && rangeHeader && (!ifRange || etagMatches(ifRange, etag))) {
		const r = parseRange(rangeHeader, st.size);
		if (r === "invalid") {
			headers.set("Content-Range", `bytes */${st.size}`);
			return new Response(null, { status: 416, headers });
		}
		if (r) {
			range = r;
			status = 206;
			headers.set("Content-Range", `bytes ${r.start}-${r.end}/${st.size}`);
		}
	}
	const length = range ? range.end - range.start + 1 : st.size;
	headers.set("Content-Length", String(length));
	if (c.req.method === "HEAD" || length === 0) return new Response(null, { status, headers });
	return new Response(await fileBody(abs, range), { status, headers });
}

export function registerAssetRoutes(app: Hono<AppEnv>) {
	app.get("/api/asset/:album/:photo/:variant", serveAsset);
}

addHttpRoutes(registerAssetRoutes);
