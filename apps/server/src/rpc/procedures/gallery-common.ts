/**
 * Helpers shared by the gallery procedures (albums, photos, tags, sharing, search, map).
 * Raw SQL fragments use the aliases `a` (albums) and `p` (photos) where noted.
 */
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db, Tx } from "../../db/index.ts";
import { type Album, accessPermissions, albums, photos, tags } from "../../db/schema.ts";
import { log } from "../../lib/log.ts";
import { albumAccessible, albumListed, photoGrant, type Viewer } from "../../policy/index.ts";
import type { Ctx } from "../context.ts";

export type Q = Db | Tx;

/** Album reference for policy helpers when the albums table is aliased as `a`. */
export const A = { id: sql`a.id`, ownerId: sql`a.owner_id` };
/** Photo reference for policy helpers when the photos table is aliased as `p`. */
export const P = { id: sql`p.id`, ownerId: sql`p.owner_id` };

/** Postgres timestamp text (drizzle mode "string") -> ISO-8601 UTC. */
export function iso(v: string | Date): string;
export function iso(v: string | Date | null | undefined): string | null;
export function iso(v: string | Date | null | undefined): string | null {
	if (v === null || v === undefined) return null;
	return new Date(v).toISOString();
}

export function isUniqueViolation(err: unknown): boolean {
	let e: unknown = err;
	for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
		if ((e as { code?: unknown }).code === "23505") return true;
		e = (e as { cause?: unknown }).cause;
	}
	return false;
}

export function passwordRequired(): ORPCError<"PASSWORD_REQUIRED", unknown> {
	return new ORPCError("PASSWORD_REQUIRED", { status: 403, message: "This album is password protected" });
}

export function inList(values: readonly (string | number)[]): SQL {
	if (values.length === 0) return sql`(null)`;
	return sql`(${sql.join(
		values.map((v) => sql`${v}`),
		sql`, `,
	)})`;
}

/**
 * Load an album by id (or by slug) and decide access. Throws NOT_FOUND / UNAUTHORIZED / PASSWORD_REQUIRED /
 * FORBIDDEN when the viewer may not open it. NOT_FOUND is used whenever the viewer cannot know the album exists.
 * UNAUTHORIZED (an anonymous visitor on a sign-in-only album) makes the web app send them to the login.
 */
export async function requireAccessibleAlbum(ctx: Ctx, idOrSlug: string, db: Q = ctx.db): Promise<Album> {
	const v = ctx.viewer;
	const rows = await db
		.select({
			album: albums,
			accessible: albumAccessible(v),
			listed: albumListed(v),
			hasPassword: sql<boolean>`exists (select 1 from ${accessPermissions} ap where ap.album_id = albums.id and ap.user_id is null and ap.password_hash is not null)`,
			requiresLogin: sql<boolean>`exists (select 1 from ${accessPermissions} ap where ap.album_id = albums.id and ap.user_id is null and ap.requires_login)`,
		})
		.from(albums)
		.where(or(eq(albums.id, idOrSlug), eq(albums.slug, idOrSlug)))
		.limit(2);
	const row = rows.find((r) => r.album.id === idOrSlug) ?? rows[0];
	if (!row) throw new ORPCError("NOT_FOUND", { message: "Album not found" });
	if (row.accessible) return row.album;
	if (row.requiresLogin && v.userId === null) throw new ORPCError("UNAUTHORIZED");
	if (row.hasPassword) throw passwordRequired();
	if (row.listed) throw new ORPCError("FORBIDDEN");
	throw new ORPCError("NOT_FOUND", { message: "Album not found" });
}

/** Load albums by ids (all must exist), with no access check. */
export async function loadAlbums(db: Q, ids: string[]): Promise<Album[]> {
	const uniq = [...new Set(ids)];
	const rows = uniq.length ? await db.select().from(albums).where(inArray(albums.id, uniq)) : [];
	if (rows.length !== uniq.length) throw new ORPCError("NOT_FOUND", { message: "Album not found" });
	return rows;
}

/** Throws FORBIDDEN unless every photo id exists and the viewer holds `grant` on it. */
export async function requirePhotoGrant(
	ctx: Ctx,
	ids: string[],
	grant: "grantsEdit" | "grantsDelete" | "grantsMove" | "grantsDownload" | "grantsFullPhotoAccess",
	db: Q = ctx.db,
): Promise<string[]> {
	const uniq = [...new Set(ids)];
	const rows = await db
		.select({ id: photos.id, ok: photoGrant(ctx.viewer, grant) })
		.from(photos)
		.where(inArray(photos.id, uniq));
	if (rows.length !== uniq.length) throw new ORPCError("NOT_FOUND", { message: "Photo not found" });
	if (rows.some((r) => !r.ok)) throw new ORPCError("FORBIDDEN");
	return uniq;
}

/** Find-or-create tags by name (trimmed, case-insensitive match on existing names). Returns ids in input order. */
export async function findOrCreateTags(db: Q, names: string[]): Promise<number[]> {
	const clean = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))];
	if (clean.length === 0) return [];
	const lowered = clean.map((n) => n.toLowerCase());
	const existing = await db
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(sql`lower(${tags.name}) in ${inList(lowered)}`);
	const byLower = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
	const missing = clean.filter((n) => !byLower.has(n.toLowerCase()));
	if (missing.length > 0) {
		await db
			.insert(tags)
			.values(missing.map((name) => ({ name })))
			.onConflictDoNothing();
		const created = await db
			.select({ id: tags.id, name: tags.name })
			.from(tags)
			.where(inArray(tags.name, missing));
		for (const t of created) byLower.set(t.name.toLowerCase(), t.id);
	}
	return [
		...new Set(clean.map((n) => byLower.get(n.toLowerCase())).filter((id): id is number => id !== undefined)),
	];
}

/** Remove tags that are attached to no photo and used by no tag album. */
export async function deleteOrphanTags(db: Q): Promise<void> {
	await db.execute(
		sql`delete from tags t where not exists (select 1 from photo_tags pt where pt.tag_id = t.id) and not exists (select 1 from tag_album_tags tat where tat.tag_id = t.id)`,
	);
}

/** Public permission row of an album, if any. */
export async function publicRow(db: Q, albumId: string) {
	const [row] = await db
		.select()
		.from(accessPermissions)
		.where(and(eq(accessPermissions.albumId, albumId), isNull(accessPermissions.userId)));
	return row ?? null;
}

export async function passwordProtectedRows(db: Q) {
	return db
		.select({ albumId: accessPermissions.albumId, passwordHash: accessPermissions.passwordHash })
		.from(accessPermissions)
		.where(and(isNull(accessPermissions.userId), isNotNull(accessPermissions.passwordHash)));
}

/** True when the viewer owns the album or is admin. */
export function ownsOrAdmin(v: Viewer, album: { ownerId: number }): boolean {
	return v.isAdmin || (v.userId !== null && v.userId === album.ownerId);
}

// ---------------------------------------------------------------------------------------------
// Bridges to the media module. Imported lazily so this module typechecks and runs even when the
// media pipeline is not present.

type MediaModule = {
	deletePhotos?: (db: Db, ids: string[]) => Promise<unknown>;
	rotatePhoto?: (db: Db, id: string, direction: "cw" | "ccw") => Promise<unknown>;
};

const MEDIA_PIPELINE = "../../media/pipeline.ts";

async function loadMedia(): Promise<MediaModule | null> {
	try {
		return (await import(/* @vite-ignore */ MEDIA_PIPELINE)) as MediaModule;
	} catch (err) {
		log.warn("media pipeline unavailable", { err: String(err) });
		return null;
	}
}

/** Delete photos (rows + files) through the media module; returns false when it is unavailable. */
export async function mediaDeletePhotos(db: Db, ids: string[]): Promise<boolean> {
	if (ids.length === 0) return true;
	const media = await loadMedia();
	if (!media?.deletePhotos) return false;
	await media.deletePhotos(db, ids);
	return true;
}

export async function mediaRotatePhoto(db: Db, id: string, direction: "cw" | "ccw"): Promise<boolean> {
	const media = await loadMedia();
	if (!media?.rotatePhoto) return false;
	await media.rotatePhoto(db, id, direction);
	return true;
}

/** Subquery of album ids: `rootId` plus all descendants reachable through albums the viewer can access. */
export function accessibleSubtree(v: Viewer, rootId: string): SQL {
	return sql`(with recursive st as (
		select id from albums where id = ${rootId}
		union all
		select c.id from albums c join st on c.parent_id = st.id where ${albumAccessible(v, { id: sql`c.id`, ownerId: sql`c.owner_id` })}
	) select id from st)`;
}

/** Escape LIKE wildcards in user input. */
export function likeEscape(s: string): string {
	return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
