/**
 * Album tiles for listings (root, children, search). One SQL statement per listing: per-album stats,
 * cover and flags come from lateral subqueries, not N+1 lookups.
 */
import {
	AlbumSortCol,
	type AlbumTile,
	SMART_ALBUM_IDS,
	type SmartAlbumId,
	type SortOrder,
} from "@longan/shared";
import { type SQL, sql } from "drizzle-orm";
import { albumAccessible, albumListed, photoVisible, type Viewer } from "../../policy/index.ts";
import { settingStr } from "../../settings/index.ts";
import type { Ctx } from "../context.ts";
import { A, iso, P } from "./gallery-common.ts";
import {
	defaultPhotoSort,
	dynamicPhotoOrder,
	photoOrderBy,
	SMART_TITLES,
	smartAllowed,
	smartScopeWhere,
	smartSort,
} from "./photo-scope.ts";

export type AlbumSort = { col: AlbumSortCol; order: SortOrder };

const C = { id: sql`c.id`, ownerId: sql`c.owner_id` };

export async function defaultAlbumSort(): Promise<AlbumSort> {
	const col = await settingStr("sorting.albums_col", "created_at");
	const order = await settingStr("sorting.albums_order", "desc");
	return {
		col: (AlbumSortCol.options as readonly string[]).includes(col) ? (col as AlbumSortCol) : "created_at",
		order: order === "asc" ? "asc" : "desc",
	};
}

/** Album sort of an album's children: its own album sorting, else the settings default. */
export async function childAlbumSort(album: { albumSortCol: string | null; albumSortOrder: string | null }) {
	if (album.albumSortCol && (AlbumSortCol.options as readonly string[]).includes(album.albumSortCol)) {
		return {
			col: album.albumSortCol as AlbumSortCol,
			order: album.albumSortOrder === "asc" ? "asc" : "desc",
		} as AlbumSort;
	}
	return defaultAlbumSort();
}

/**
 * Photos of album alias `a` as seen through photo alias `p`: direct links for regular albums, tag criteria
 * (AND/OR) plus photo visibility for tag albums.
 */
export function albumMembers(v: Viewer): SQL {
	return sql`(p.id in (
		select pa.photo_id from photo_album pa where a.kind = 'album' and pa.album_id = a.id
		union all
		select pt.photo_id from photo_tags pt join tag_album_tags tat on tat.tag_id = pt.tag_id
		where a.kind = 'tag' and tat.album_id = a.id
		group by pt.photo_id
		having a.tag_logic = 'or' or count(distinct pt.tag_id) = (select count(*) from tag_album_tags t3 where t3.album_id = a.id)
	) and (a.kind = 'album' or ${photoVisible(v, P)}))`;
}

function albumOrder(sort: AlbumSort): SQL {
	const dir = sql.raw(sort.order === "asc" ? "asc" : "desc");
	const col = {
		created_at: sql`a.created_at`,
		title: sql`a.title`,
		min_taken_at: sql`st.mn`,
		max_taken_at: sql`st.mx`,
	}[sort.col];
	return sql`${col} ${dir} nulls last, a.title asc, a.id asc`;
}

type TileRow = {
	id: string;
	kind: "album" | "tag";
	title: string;
	is_nsfw: boolean;
	owner_id: number;
	created_at: string;
	is_public: boolean;
	is_link_required: boolean;
	requires_login: boolean;
	is_locked: boolean;
	num_photos: number;
	min_taken_at: string | null;
	max_taken_at: string | null;
	has_children: boolean;
	cover_id: string | null;
	cover_colour: string | null;
};

/** Tiles for albums matching `where` (SQL over alias `a`), ordered by `sort`. */
export async function albumTiles(
	ctx: Ctx,
	where: SQL,
	sort: AlbumSort,
	limit?: number,
): Promise<AlbumTile[]> {
	const v = ctx.viewer;
	const def = await defaultPhotoSort();
	const member = albumMembers(v);
	const coverOrder = dynamicPhotoOrder(
		sql`coalesce(a.photo_sort_col, ${def.col})`,
		sql`coalesce(a.photo_sort_order, ${def.order})`,
		"p",
	);
	const rows = await ctx.db.execute<TileRow>(sql`
		select a.id, a.kind, a.title, a.is_nsfw, a.owner_id, a.created_at,
			(pub.id is not null) as is_public,
			coalesce(pub.is_link_required, false) as is_link_required,
			coalesce(pub.requires_login, false) as requires_login,
			(pub.password_hash is not null and not acc.ok) as is_locked,
			st.n as num_photos, st.mn as min_taken_at, st.mx as max_taken_at,
			exists (select 1 from albums c where c.parent_id = a.id and ${albumListed(v, C)}) as has_children,
			cov.id as cover_id, cov.colour as cover_colour
		from albums a
		left join access_permissions pub on pub.album_id = a.id and pub.user_id is null
		cross join lateral (select ${albumAccessible(v, A)} as ok) acc
		left join lateral (
			select count(*)::int as n, min(p.taken_at) as mn, max(p.taken_at) as mx from photos p where ${member}
		) st on true
		left join lateral (
			select p.id, p.colours[1] as colour from photos p
			where acc.ok and ${member}
			order by (p.id is not distinct from a.cover_id) desc, ${coverOrder}
			limit 1
		) cov on true
		where ${where}
		order by ${albumOrder(sort)}
		${limit ? sql`limit ${limit}` : sql``}
	`);
	return rows.map(
		(r): AlbumTile => ({
			id: r.id,
			kind: r.kind,
			title: r.title,
			coverId: r.cover_id,
			coverColour: r.cover_colour,
			isNsfw: r.is_nsfw,
			isPublic: r.is_public,
			isLinkRequired: r.is_link_required,
			requiresLogin: r.requires_login,
			isLocked: r.is_locked,
			hasChildren: r.has_children,
			numPhotos: Number(r.num_photos),
			ownerId: r.owner_id,
			createdAt: iso(r.created_at),
			minTakenAt: iso(r.min_taken_at),
			maxTakenAt: iso(r.max_taken_at),
		}),
	);
}

type SmartRow = {
	n: number;
	mn: string | null;
	mx: string | null;
	cover_id: string | null;
	cover_colour: string | null;
};

/** Stats + cover of a smart album for the viewer (assumes it is allowed). */
export async function smartStats(ctx: Ctx, id: SmartAlbumId) {
	const where = await smartScopeWhere(id, ctx.viewer);
	const order = photoOrderBy(await smartSort(id));
	const [row] = await ctx.db.execute<SmartRow>(sql`
		select st.n, st.mn, st.mx, cov.id as cover_id, cov.colour as cover_colour
		from (select count(*)::int as n, min(photos.taken_at) as mn, max(photos.taken_at) as mx from photos where ${where}) st
		left join lateral (
			select photos.id, photos.colours[1] as colour from photos where ${where} order by ${sql.join(order, sql`, `)} limit 1
		) cov on true
	`);
	return {
		numPhotos: Number(row?.n ?? 0),
		minTakenAt: iso(row?.mn ?? null),
		maxTakenAt: iso(row?.mx ?? null),
		coverId: row?.cover_id ?? null,
		coverColour: row?.cover_colour ?? null,
	};
}

/** Smart album tiles enabled for the viewer (timeline excluded: it is a route, not a tile). */
export async function smartTiles(ctx: Ctx): Promise<AlbumTile[]> {
	const ids = SMART_ALBUM_IDS.filter((id) => id !== "timeline");
	const allowed: SmartAlbumId[] = [];
	for (const id of ids) if (await smartAllowed(id, ctx.viewer)) allowed.push(id);
	const now = new Date().toISOString();
	return Promise.all(
		allowed.map(async (id): Promise<AlbumTile> => {
			const s = await smartStats(ctx, id);
			return {
				id,
				kind: "smart",
				title: SMART_TITLES[id],
				coverId: s.coverId,
				coverColour: s.coverColour,
				isNsfw: false,
				isPublic: false,
				isLinkRequired: false,
				requiresLogin: false,
				isLocked: false,
				hasChildren: false,
				numPhotos: s.numPhotos,
				ownerId: null,
				createdAt: now,
				minTakenAt: s.minTakenAt,
				maxTakenAt: s.maxTakenAt,
			};
		}),
	);
}
