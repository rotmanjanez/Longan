/**
 * Authorization model (mirrors Lychee's AlbumQueryPolicy, simplified).
 *
 * - Admin (Keycloak role) bypasses everything.
 * - The owner of an album/photo can do everything with it.
 * - access_permissions rows: user_id NULL = public grant; user_id set = per-user share.
 *   A public row with requires_login opens the album to every signed-in user but not to anonymous visitors.
 * - Photos have no flags of their own: a photo is visible when ANY album containing it is accessible
 *   (or the viewer owns it). Photos in no album are visible to owner/admin only ("unsorted").
 * - Nothing is inherited down the tree; every album needs its own row.
 *
 * All helpers return Drizzle SQL fragments so every listing applies the same filter in the database.
 */

import type { AlbumRights, PhotoRights } from "@longan/shared";
import { and, eq, exists, isNull, or, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "../db/index.ts";
import {
	type AccessPermission,
	type Album,
	accessPermissions,
	albums,
	photoAlbum,
	photos,
} from "../db/schema.ts";

export type Viewer = {
	userId: number | null;
	isAdmin: boolean;
	mayUpload: boolean;
	/** Album ids unlocked with a password in this session. */
	unlockedAlbumIds: string[];
};

export const GUEST: Viewer = { userId: null, isAdmin: false, mayUpload: false, unlockedAlbumIds: [] };

type AlbumRef = { id: PgColumn | SQL; ownerId: PgColumn | SQL };

const TRUE = sql<boolean>`true`;
const FALSE = sql<boolean>`false`;

function unlockedList(v: Viewer): SQL {
	if (v.unlockedAlbumIds.length === 0) return sql`('')`;
	return sql`(${sql.join(
		v.unlockedAlbumIds.map((id) => sql`${id}`),
		sql`, `,
	)})`;
}

/** EXISTS(per-user grant row for this viewer on the album). */
function userGrantExists(v: Viewer, a: AlbumRef, extra?: SQL): SQL<boolean> {
	if (v.userId === null) return FALSE;
	const ap = accessPermissions;
	return exists(
		sql`(select 1 from ${ap} where ${ap.albumId} = ${a.id} and ${ap.userId} = ${v.userId}${extra ? sql` and ${extra}` : sql``})`,
	) as SQL<boolean>;
}

/** Extra condition on the public row: anonymous visitors only get rows that do not require sign-in. */
function guestRowFilter(v: Viewer): SQL {
	return v.userId === null ? sql` and ${accessPermissions.requiresLogin} = false` : sql``;
}

/** EXISTS(public grant row that is open for this viewer: no password, or unlocked; signed in when required). */
function publicGrantOpen(v: Viewer, a: AlbumRef, extra?: SQL): SQL<boolean> {
	const ap = accessPermissions;
	return exists(
		sql`(select 1 from ${ap} where ${ap.albumId} = ${a.id} and ${ap.userId} is null${guestRowFilter(v)} and (${ap.passwordHash} is null or ${a.id} in ${unlockedList(v)})${extra ? sql` and ${extra}` : sql``})`,
	) as SQL<boolean>;
}

function isOwner(v: Viewer, a: AlbumRef): SQL<boolean> {
	if (v.userId === null) return FALSE;
	return sql<boolean>`${a.ownerId} = ${v.userId}`;
}

/** Viewer may open the album (direct URL access). */
export function albumAccessible(v: Viewer, a: AlbumRef = albums): SQL<boolean> {
	if (v.isAdmin) return TRUE;
	return or(isOwner(v, a), userGrantExists(v, a), publicGrantOpen(v, a)) as SQL<boolean>;
}

/**
 * Album appears in listings (root/children/search). Link-required public albums are hidden here, and sign-in-only
 * albums are hidden from anonymous visitors. Locked albums are listed.
 */
export function albumListed(v: Viewer, a: AlbumRef = albums): SQL<boolean> {
	if (v.isAdmin) return TRUE;
	const ap = accessPermissions;
	const publicListed = exists(
		sql`(select 1 from ${ap} where ${ap.albumId} = ${a.id} and ${ap.userId} is null${guestRowFilter(v)} and ${ap.isLinkRequired} = false)`,
	) as SQL<boolean>;
	return or(isOwner(v, a), userGrantExists(v, a), publicListed) as SQL<boolean>;
}

/** Viewer holds a specific grant on the album through a user row or the (open) public row. */
export function albumGrant(
	v: Viewer,
	grant:
		| "grantsFullPhotoAccess"
		| "grantsDownload"
		| "grantsUpload"
		| "grantsEdit"
		| "grantsDelete"
		| "grantsMove",
	a: AlbumRef = albums,
): SQL<boolean> {
	if (v.isAdmin) return TRUE;
	const col = accessPermissions[grant];
	const parts: SQL<boolean>[] = [isOwner(v, a), userGrantExists(v, a, sql`${col} = true`)];
	// Only these grants are meaningful on the public row.
	if (grant === "grantsFullPhotoAccess" || grant === "grantsDownload" || grant === "grantsUpload") {
		parts.push(publicGrantOpen(v, a, sql`${col} = true`));
	}
	return or(...parts) as SQL<boolean>;
}

type PhotoRef = { id: PgColumn | SQL; ownerId: PgColumn | SQL };

/** Photo visible: owner, admin, or in at least one accessible album. */
export function photoVisible(v: Viewer, p: PhotoRef = photos): SQL<boolean> {
	if (v.isAdmin) return TRUE;
	const pa = photoAlbum;
	const a = { id: sql`pa_a.id`, ownerId: sql`pa_a.owner_id` };
	const viaAlbum = exists(
		sql`(select 1 from ${pa} join ${albums} as pa_a on pa_a.id = ${pa.albumId} where ${pa.photoId} = ${p.id} and ${albumAccessible(v, a)})`,
	) as SQL<boolean>;
	const owner = v.userId === null ? FALSE : sql<boolean>`${p.ownerId} = ${v.userId}`;
	return or(owner, viaAlbum) as SQL<boolean>;
}

/** Photo-level grant through any containing album. */
export function photoGrant(
	v: Viewer,
	grant: "grantsFullPhotoAccess" | "grantsDownload" | "grantsEdit" | "grantsDelete" | "grantsMove",
	p: PhotoRef = photos,
): SQL<boolean> {
	if (v.isAdmin) return TRUE;
	const pa = photoAlbum;
	const a = { id: sql`pg_a.id`, ownerId: sql`pg_a.owner_id` };
	const viaAlbum = exists(
		sql`(select 1 from ${pa} join ${albums} as pg_a on pg_a.id = ${pa.albumId} where ${pa.photoId} = ${p.id} and ${albumGrant(v, grant, a)})`,
	) as SQL<boolean>;
	const owner = v.userId === null ? FALSE : sql<boolean>`${p.ownerId} = ${v.userId}`;
	return or(owner, viaAlbum) as SQL<boolean>;
}

/** Album is NSFW itself or has an NSFW ancestor (recursive CTE). Used to hide sensitive content from smart albums/search. */
export function albumRecursiveNsfw(a: AlbumRef = albums): SQL<boolean> {
	return sql<boolean>`exists (with recursive up as (select id, parent_id, is_nsfw from ${albums} where id = ${a.id} union all select p.id, p.parent_id, p.is_nsfw from ${albums} p join up on p.id = up.parent_id) select 1 from up where is_nsfw = true)`;
}

/** Load the permission rows relevant to a viewer for one album and compute rights in JS. */
export async function albumRightsFor(db: Db, v: Viewer, album: Album): Promise<AlbumRights> {
	const all: AlbumRights = {
		canEdit: true,
		canDelete: true,
		canMove: true,
		canUpload: true,
		canDownload: true,
		canShare: true,
		canAccessFullPhoto: true,
	};
	if (v.isAdmin || (v.userId !== null && album.ownerId === v.userId)) return all;
	const rows = await db
		.select()
		.from(accessPermissions)
		.where(
			and(
				eq(accessPermissions.albumId, album.id),
				v.userId === null
					? isNull(accessPermissions.userId)
					: or(isNull(accessPermissions.userId), eq(accessPermissions.userId, v.userId)),
			),
		);
	return rightsFromRows(v, album.id, rows);
}

export function rightsFromRows(v: Viewer, albumId: string, rows: AccessPermission[]): AlbumRights {
	const none: AlbumRights = {
		canEdit: false,
		canDelete: false,
		canMove: false,
		canUpload: false,
		canDownload: false,
		canShare: false,
		canAccessFullPhoto: false,
	};
	const userRow = v.userId === null ? undefined : rows.find((r) => r.userId === v.userId);
	if (userRow) {
		return {
			canEdit: userRow.grantsEdit,
			canDelete: userRow.grantsDelete,
			canMove: userRow.grantsMove,
			canUpload: userRow.grantsUpload,
			canDownload: userRow.grantsDownload,
			canShare: false,
			canAccessFullPhoto: userRow.grantsFullPhotoAccess,
		};
	}
	const pub = rows.find((r) => r.userId === null);
	if (!pub || (pub.requiresLogin && v.userId === null)) return none;
	const open = pub.passwordHash === null || v.unlockedAlbumIds.includes(albumId);
	if (!open) return none;
	return {
		...none,
		canUpload: pub.grantsUpload,
		canDownload: pub.grantsDownload,
		canAccessFullPhoto: pub.grantsFullPhotoAccess,
	};
}

/** Photo rights reduce over the albums containing it: allowed if ANY album allows it. */
export async function photoRightsFor(
	db: Db,
	v: Viewer,
	photo: { id: string; ownerId: number },
): Promise<PhotoRights> {
	if (v.isAdmin || (v.userId !== null && photo.ownerId === v.userId)) {
		return { canEdit: true, canDelete: true, canMove: true, canDownload: true, canAccessFullPhoto: true };
	}
	const p = { id: sql`${photo.id}`, ownerId: sql`${photo.ownerId}` };
	const [row] = await db
		.select({
			canEdit: photoGrant(v, "grantsEdit", p),
			canDelete: photoGrant(v, "grantsDelete", p),
			canMove: photoGrant(v, "grantsMove", p),
			canDownload: photoGrant(v, "grantsDownload", p),
			canAccessFullPhoto: photoGrant(v, "grantsFullPhotoAccess", p),
		})
		.from(sql`(select 1) as one`);
	return (
		row ?? { canEdit: false, canDelete: false, canMove: false, canDownload: false, canAccessFullPhoto: false }
	);
}
