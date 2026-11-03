import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { ID_RE, SizeVariantType, THUMB_CLASS_VARIANTS } from "@longan/shared";
import { and, inArray, sql } from "drizzle-orm";
import type { Context, Hono } from "hono";
import yazl from "yazl";
import { type AppEnv, addHttpRoutes } from "../app.ts";
import { db } from "../db/index.ts";
import { albums, photoAlbum, photos, sizeVariants } from "../db/schema.ts";
import { log } from "../lib/log.ts";
import { absPath } from "../media/storage.ts";
import { albumAccessible, photoGrant, photoVisible } from "../policy/index.ts";
import { contentDisposition, extOf, jsonError, safeName } from "./common.ts";

/** Best-available order when the requested variant is missing (largest first). */
const BEST: SizeVariantType[] = ["original", "medium2x", "medium", "small2x", "small", "thumb2x", "thumb"];

const idList = (v: string | undefined) =>
	(v ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter((s) => ID_RE.test(s));

/** Unique names inside one folder: on collision the id is appended. */
class Folder {
	used = new Set<string>();
	name(base: string, id: string, ext = ""): string {
		let n = `${base}${ext}`;
		if (this.used.has(n.toLowerCase())) n = `${base} (${id})${ext}`;
		this.used.add(n.toLowerCase());
		return n;
	}
}

type Entry = { abs: string; name: string; mtime: Date };

/**
 * GET /api/zip?albums=a,b&photos=x,y&variant=original
 * Streams a ZIP; albums recurse into sub-folders. Items the viewer may not download are skipped silently.
 * Without the full-photo grant only thumb-class variants are packed (like the asset route), largest first.
 * Tag albums contribute no files (their photo set is computed by the gallery module).
 */
async function zip(c: Context<AppEnv>) {
	const { viewer } = c.get("auth");
	const albumIds = idList(c.req.query("albums"));
	const photoIds = idList(c.req.query("photos"));
	const v = SizeVariantType.safeParse(c.req.query("variant") || "original");
	if (!v.success) return jsonError(c, 400, "BAD_REQUEST", "unknown size variant");
	if (albumIds.length === 0 && photoIds.length === 0)
		return jsonError(c, 400, "BAD_REQUEST", "nothing selected");
	const order = [
		v.data,
		...BEST.slice(BEST.indexOf(v.data) + 1),
		...BEST.slice(0, BEST.indexOf(v.data)).reverse(),
	];
	const thumbOrder = order.filter((t) => THUMB_CLASS_VARIANTS.includes(t));

	// Album subtree of every requested album; descend only through albums the viewer can open.
	type Node = { id: string; parentId: string | null; title: string; accessible: boolean };
	let nodes: Node[] = [];
	if (albumIds.length > 0) {
		const ids = sql.join(
			albumIds.map((id) => sql`${id}`),
			sql`, `,
		);
		const tree = await db.execute<{ id: string }>(
			sql`with recursive tree as (select id from ${albums} where id in (${ids}) union select a.id from ${albums} a join tree t on a.parent_id = t.id) select id from tree`,
		);
		const treeIds = [...tree].map((r) => r.id);
		if (treeIds.length > 0) {
			nodes = await db
				.select({
					id: albums.id,
					parentId: albums.parentId,
					title: albums.title,
					accessible: albumAccessible(viewer),
				})
				.from(albums)
				.where(inArray(albums.id, treeIds));
		}
	}
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const children = new Map<string, Node[]>();
	for (const n of nodes) {
		if (!n.parentId) continue;
		const list = children.get(n.parentId) ?? [];
		list.push(n);
		children.set(n.parentId, list);
	}

	const folderOfAlbum = new Map<string, string>();
	const root = new Folder();
	const folders = new Map<string, Folder>();
	const walk = (n: Node, prefix: string, parent: Folder) => {
		if (!n.accessible || folderOfAlbum.has(n.id)) return;
		const path = `${prefix}${parent.name(safeName(n.title), n.id)}/`;
		folderOfAlbum.set(n.id, path);
		const f = new Folder();
		folders.set(path, f);
		for (const child of (children.get(n.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)))
			walk(child, path, f);
	};
	for (const id of albumIds) {
		const n = byId.get(id);
		if (n) walk(n, "", root);
	}

	// Downloadable photos: per album link, plus loose photos at the root.
	const items: Array<{ photoId: string; title: string; fullAccess: boolean; folder: string }> = [];
	const accessibleAlbums = [...folderOfAlbum.keys()];
	if (accessibleAlbums.length > 0) {
		const rows = await db
			.select({
				photoId: photos.id,
				title: photos.title,
				fullAccess: photoGrant(viewer, "grantsFullPhotoAccess"),
				albumId: photoAlbum.albumId,
			})
			.from(photoAlbum)
			.innerJoin(photos, sql`${photos.id} = ${photoAlbum.photoId}`)
			.where(and(inArray(photoAlbum.albumId, accessibleAlbums), photoGrant(viewer, "grantsDownload")))
			.orderBy(photos.takenAt, photos.createdAt);
		for (const r of rows)
			items.push({
				photoId: r.photoId,
				title: r.title,
				fullAccess: r.fullAccess,
				folder: folderOfAlbum.get(r.albumId)!,
			});
	}
	if (photoIds.length > 0) {
		const rows = await db
			.select({
				photoId: photos.id,
				title: photos.title,
				fullAccess: photoGrant(viewer, "grantsFullPhotoAccess"),
			})
			.from(photos)
			.where(and(inArray(photos.id, photoIds), photoVisible(viewer), photoGrant(viewer, "grantsDownload")));
		for (const r of rows) items.push({ ...r, folder: "" });
	}

	const variantRows =
		items.length === 0
			? []
			: await db
					.select({ photoId: sizeVariants.photoId, type: sizeVariants.type, path: sizeVariants.path })
					.from(sizeVariants)
					.where(
						inArray(
							sizeVariants.photoId,
							items.map((i) => i.photoId),
						),
					);
	const variants = new Map<string, Map<string, string>>();
	for (const r of variantRows) {
		const m = variants.get(r.photoId) ?? new Map<string, string>();
		m.set(r.type, r.path);
		variants.set(r.photoId, m);
	}

	const entries: Entry[] = [];
	for (const item of items) {
		const m = variants.get(item.photoId);
		const type = m && (item.fullAccess ? order : thumbOrder).find((t) => m.has(t));
		if (!m || !type) continue;
		const rel = m.get(type)!;
		const abs = absPath(rel);
		let mtime: Date;
		try {
			mtime = (await stat(abs)).mtime;
		} catch {
			log.warn("zip: file missing", { photoId: item.photoId, path: rel });
			continue;
		}
		const folder = item.folder === "" ? root : folders.get(item.folder)!;
		const name = folder.name(safeName(item.title), item.photoId, `.${extOf(rel)}`);
		entries.push({ abs, name: `${item.folder}${name}`, mtime });
	}
	if (entries.length === 0) return jsonError(c, 404, "NOT_FOUND", "nothing to download");

	const z = new yazl.ZipFile();
	for (const e of entries) z.addFile(e.abs, e.name, { compress: false, mtime: e.mtime });
	for (const path of folders.keys()) {
		if (!entries.some((e) => e.name.startsWith(path))) z.addEmptyDirectory(path);
	}
	z.end();
	z.outputStream.on("error", (err) => log.error("zip stream failed", { err: String(err) }));

	const single = albumIds.length === 1 && photoIds.length === 0 ? byId.get(albumIds[0]!) : undefined;
	const filename = `${single ? safeName(single.title) : "Longan"}.zip`;
	return new Response(Readable.toWeb(z.outputStream as Readable) as ReadableStream, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": contentDisposition(filename),
			"Cache-Control": "private, no-store",
		},
	});
}

export function registerZipRoutes(app: Hono<AppEnv>) {
	app.get("/api/zip", zip);
}

addHttpRoutes(registerZipRoutes);
