import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ID_RE } from "@longan/shared";
import { eq } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { type AppEnv, addHttpRoutes } from "../app.ts";
import { db } from "../db/index.ts";
import { albums } from "../db/schema.ts";
import { env } from "../env.ts";
import { log } from "../lib/log.ts";
import { ImportError, importFile, MediaError } from "../media/pipeline.ts";
import { safeUnlink, tmpFile } from "../media/storage.ts";
import { albumGrant } from "../policy/index.ts";

class TooLarge extends Error {}

/** Counts bytes and aborts once the limit is exceeded (bodies without Content-Length). */
function limit(max: number) {
	let seen = 0;
	return new Transform({
		transform(chunk: Buffer, _enc, cb) {
			seen += chunk.length;
			if (seen > max) cb(new TooLarge(`upload exceeds ${max} bytes`));
			else cb(null, chunk);
		},
	});
}

type UploadStatus = "created" | "duplicate" | "skipped" | "error";
const CODES: Record<number, string> = {
	400: "BAD_REQUEST",
	401: "UNAUTHORIZED",
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	413: "PAYLOAD_TOO_LARGE",
	415: "UNSUPPORTED_MEDIA_TYPE",
	500: "INTERNAL_SERVER_ERROR",
};
/** Upload result; errors also carry the plain-route `{ error: { code, message } }` shape. */
function reply(
	c: Context,
	status: number,
	body: { status: UploadStatus; photoId?: string; message?: string },
) {
	const error =
		body.status === "error" ? { code: CODES[status] ?? "ERROR", message: body.message ?? "" } : undefined;
	return c.json(error ? { ...body, error } : body, status as 200);
}

/**
 * PUT /api/upload?album=<id or empty>&name=<filename>&mtime=<ms>; raw file body.
 * Logged-in users with mayUpload may upload to unsorted; album uploads need the upload grant (owner, share,
 * or the album's public row for guests). Photos uploaded into an album belong to the album owner.
 */
async function upload(c: Context<AppEnv>) {
	const auth = c.get("auth");
	const viewer = auth.viewer;
	const albumId = c.req.query("album")?.trim() || null;
	const name = (c.req.query("name") ?? "").trim() || "upload";
	const mtimeRaw = Number(c.req.query("mtime"));
	const mtime = Number.isFinite(mtimeRaw) && mtimeRaw > 0 ? mtimeRaw : null;

	let ownerId: number;
	if (albumId) {
		if (!ID_RE.test(albumId)) return reply(c, 404, { status: "error", message: "Album not found" });
		const [album] = await db
			.select({ kind: albums.kind, ownerId: albums.ownerId, mayUpload: albumGrant(viewer, "grantsUpload") })
			.from(albums)
			.where(eq(albums.id, albumId));
		if (album?.kind !== "album") return reply(c, 404, { status: "error", message: "Album not found" });
		if (!album.mayUpload) {
			return auth.user
				? reply(c, 403, { status: "error", message: "Not allowed to upload into this album" })
				: reply(c, 401, { status: "error", message: "Login required" });
		}
		ownerId = album.ownerId;
	} else {
		if (!auth.user) return reply(c, 401, { status: "error", message: "Login required" });
		if (!viewer.mayUpload && !viewer.isAdmin) {
			return reply(c, 403, { status: "error", message: "Not allowed to upload" });
		}
		ownerId = auth.user.id;
	}

	const declared = Number(c.req.header("content-length") ?? Number.NaN);
	if (Number.isFinite(declared) && declared > env.UPLOAD_MAX_BYTES) {
		return reply(c, 413, { status: "error", message: `File exceeds ${env.UPLOAD_MAX_BYTES} bytes` });
	}
	const body = c.req.raw.body;
	if (!body) return reply(c, 400, { status: "error", message: "Empty body" });

	const tmp = await tmpFile();
	try {
		try {
			await pipeline(
				Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>),
				limit(env.UPLOAD_MAX_BYTES),
				createWriteStream(tmp),
			);
		} catch (err) {
			if (err instanceof TooLarge) {
				return reply(c, 413, { status: "error", message: `File exceeds ${env.UPLOAD_MAX_BYTES} bytes` });
			}
			log.warn("upload stream aborted", { err: String(err) });
			return reply(c, 400, { status: "error", message: "Upload interrupted" });
		}
		const res = await importFile({ tmpPath: tmp, originalName: name, mtime, albumId, ownerId, viewer });
		return reply(c, 200, { status: res.status, photoId: res.photoId });
	} catch (err) {
		if (err instanceof MediaError) return reply(c, 415, { status: "error", message: err.message });
		if (err instanceof ImportError) {
			return reply(c, err.code === "NOT_FOUND" ? 404 : 403, { status: "error", message: err.message });
		}
		log.error("upload failed", {
			name,
			err: err instanceof Error ? (err.stack ?? err.message) : String(err),
		});
		return reply(c, 500, { status: "error", message: "Processing failed" });
	} finally {
		await safeUnlink(tmp);
	}
}

export function registerUploadRoutes(app: Hono<AppEnv>) {
	app.put("/api/upload", upload);
}

addHttpRoutes(registerUploadRoutes);
