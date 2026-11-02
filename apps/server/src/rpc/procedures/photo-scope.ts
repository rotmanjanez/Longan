/**
 * Photo scopes: which photos an album id (real, tag, smart, timeline) shows to a viewer, in which order,
 * and how they are grouped into buckets. All fragments reference the photos table by its own name
 * (`photos`), so they plug into `db.select().from(photos)` and raw `from photos` queries alike.
 */
import {
	type AnyAlbumId,
	type BucketGranularity,
	isSmartAlbumId,
	type PhotoRatiosSoA,
	PhotoSortCol,
	type SmartAlbumId,
	type SortOrder,
} from "@longan/shared";
import { ORPCError } from "@orpc/server";
import { eq, type SQL, sql } from "drizzle-orm";
import { photos, tagAlbumTags } from "../../db/schema.ts";
import { albumRecursiveNsfw, photoVisible, type Viewer } from "../../policy/index.ts";
import { settingBool, settingInt, settingStr } from "../../settings/index.ts";
import type { Ctx } from "../context.ts";
import { inList, iso, requireAccessibleAlbum, requireSiteAccess } from "./gallery-common.ts";

export type PhotoSort = { col: PhotoSortCol; order: SortOrder };

export type PhotoScope = {
	/** Filter on the photos table. */
	where: SQL;
	orderBy: SQL[];
	sort: PhotoSort;
	/** Album id to use in asset urls. */
	albumCtx: string;
};

export const SMART_TITLES: Record<SmartAlbumId, string> = {
	unsorted: "Unsorted",
	recent: "Recent",
	highlighted: "Highlighted",
	untagged: "Untagged",
	on_this_day: "On this day",
	timeline: "Timeline",
};

const PHOTO_SORT_COLS: readonly PhotoSortCol[] = PhotoSortCol.options;
const DATE_COLS: readonly PhotoSortCol[] = ["created_at", "taken_at"];

export async function defaultPhotoSort(): Promise<PhotoSort> {
	const col = (await settingStr("sorting.photos_col", "taken_at")) as PhotoSortCol;
	const order = (await settingStr("sorting.photos_order", "asc")) as SortOrder;
	return {
		col: (PHOTO_SORT_COLS as readonly string[]).includes(col) ? col : "taken_at",
		order: order === "desc" ? "desc" : "asc",
	};
}

/** Sort key expression for a column on photo alias `p` (default: the table itself). */
export function photoSortExpr(col: PhotoSortCol, p = "photos"): SQL {
	const t = sql.raw(p);
	switch (col) {
		case "created_at":
			return sql`${t}.created_at`;
		case "taken_at":
			// Photos without capture date sort (and bucket) by upload date so buckets stay contiguous.
			return sql`coalesce(${t}.taken_at, ${t}.created_at)`;
		case "title":
			return sql`${t}.title`;
		case "is_highlighted":
			return sql`${t}.is_highlighted`;
		case "type":
			return sql`${t}.type`;
		case "rating_avg":
			return sql`${t}.rating_avg`;
	}
}

export function photoOrderBy(sort: PhotoSort, p = "photos"): SQL[] {
	const t = sql.raw(p);
	const dir = sql.raw(sort.order === "desc" ? "desc" : "asc");
	return [
		sql`${photoSortExpr(sort.col, p)} ${dir} nulls last`,
		sql`${t}.created_at ${dir}`,
		sql`${t}.id asc`,
	];
}

/**
 * Per-row dynamic photo order for listings over many albums (e.g. tile covers): the column and direction
 * come from SQL expressions (album columns with a settings fallback).
 */
export function dynamicPhotoOrder(colExpr: SQL, orderExpr: SQL, p = "p"): SQL {
	const parts: SQL[] = [];
	for (const col of PHOTO_SORT_COLS) {
		for (const o of ["asc", "desc"] as const) {
			parts.push(
				sql`case when ${colExpr} = ${col} and ${orderExpr} = ${o} then ${photoSortExpr(col, p)} end ${sql.raw(o)} nulls last`,
			);
		}
	}
	parts.push(sql`${sql.raw(p)}.id asc`);
	return sql.join(parts, sql`, `);
}

export function isDateSort(sort: PhotoSort): boolean {
	return DATE_COLS.includes(sort.col);
}

const FORMATS: Record<BucketGranularity, string> = { year: "YYYY", month: "YYYY-MM", day: "YYYY-MM-DD" };

/** Bucket id expression for a scope (date sorts only; otherwise the single bucket "all"). */
export function bucketExpr(sort: PhotoSort, granularity: BucketGranularity, p = "photos"): SQL<string> {
	if (!isDateSort(sort)) return sql<string>`'all'`;
	return sql<string>`to_char(${photoSortExpr(sort.col, p)} at time zone 'UTC', ${FORMATS[granularity]})`;
}

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** "2024" -> "2024", "2024-03" -> "March 2024", "2024-03-15" -> "15 March 2024", "all" -> "". */
export function bucketLabel(id: string): string {
	const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(id);
	if (!m) return "";
	const [, y, mo, d] = m;
	if (!mo) return y ?? "";
	const month = MONTHS[Number(mo) - 1] ?? mo;
	return d ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

/** Photo passes unless every album containing it is (recursively) NSFW. */
export function nsfwFilter(): SQL {
	return sql`(not exists (select 1 from photo_album nx where nx.photo_id = photos.id) or exists (select 1 from photo_album nx where nx.photo_id = photos.id and not ${albumRecursiveNsfw({ id: sql`nx.album_id`, ownerId: sql`null` })}))`;
}

/** NSFW exclusion for smart albums/search/map, or null when nsfw.visible_by_default is on. */
export async function nsfwExclusion(): Promise<SQL | null> {
	return (await settingBool("nsfw.visible_by_default", false)) ? null : nsfwFilter();
}

/** Smart album condition (without visibility). */
export async function smartCondition(id: SmartAlbumId, v: Viewer): Promise<SQL> {
	switch (id) {
		case "recent": {
			const days = await settingInt("smart.recent_age_days", 30);
			return sql`photos.created_at >= now() - make_interval(days => ${days}::int)`;
		}
		case "highlighted":
			return sql`photos.is_highlighted = true`;
		case "untagged":
			return sql`not exists (select 1 from photo_tags su where su.photo_id = photos.id)`;
		case "on_this_day":
			return sql`(extract(month from coalesce(photos.taken_at, photos.created_at) at time zone 'UTC') = extract(month from now() at time zone 'UTC') and extract(day from coalesce(photos.taken_at, photos.created_at) at time zone 'UTC') = extract(day from now() at time zone 'UTC'))`;
		case "unsorted": {
			const none = sql`not exists (select 1 from photo_album su where su.photo_id = photos.id)`;
			if (v.isAdmin) return none;
			return sql`(${none} and photos.owner_id = ${v.userId ?? -1})`;
		}
		case "timeline":
			return sql`true`;
	}
}

export async function smartSort(id: SmartAlbumId): Promise<PhotoSort> {
	switch (id) {
		case "recent":
			return { col: "created_at", order: "desc" };
		case "on_this_day":
		case "timeline":
			return { col: "taken_at", order: "desc" };
		default:
			return defaultPhotoSort();
	}
}

/**
 * Whether a smart album is enabled and allowed for the viewer. `timeline` is gated by features.timeline
 * (+ features.timeline_public for guests); the others by smart.<id> (+ smart.public for guests);
 * `unsorted` is for logged-in users only.
 */
export async function smartAllowed(id: SmartAlbumId, v: Viewer): Promise<boolean> {
	const guest = v.userId === null;
	if (id === "timeline") {
		if (!(await settingBool("features.timeline", true))) return false;
		return !guest || (await settingBool("features.timeline_public", false));
	}
	if (!(await settingBool(`smart.${id}`, false))) return false;
	if (id === "unsorted") return !guest;
	return !guest || (await settingBool("smart.public", false));
}

export async function smartScopeWhere(id: SmartAlbumId, v: Viewer): Promise<SQL> {
	const parts = [await smartCondition(id, v), photoVisible(v)];
	const nsfw = await nsfwExclusion();
	if (nsfw) parts.push(nsfw);
	return sql.join(
		parts.map((p) => sql`(${p})`),
		sql` and `,
	);
}

/** Tag album membership on the photos table for given tag ids and logic. */
export function tagMembership(tagIds: number[], logic: "and" | "or"): SQL {
	if (tagIds.length === 0) return sql`false`;
	if (logic === "or") {
		return sql`photos.id in (select tm.photo_id from photo_tags tm where tm.tag_id in ${inList(tagIds)})`;
	}
	return sql`photos.id in (select tm.photo_id from photo_tags tm where tm.tag_id in ${inList(tagIds)} group by tm.photo_id having count(distinct tm.tag_id) = ${tagIds.length}::int)`;
}

/** Resolve the photo scope of an album id for the viewer, enforcing access. */
export async function photoScope(ctx: Ctx, album: AnyAlbumId): Promise<PhotoScope> {
	const v = ctx.viewer;
	if (isSmartAlbumId(album)) {
		await requireSiteAccess(ctx);
		if (!(await smartAllowed(album, v))) {
			throw new ORPCError(v.userId === null ? "UNAUTHORIZED" : "NOT_FOUND");
		}
		const sort = await smartSort(album);
		return {
			where: await smartScopeWhere(album, v),
			orderBy: photoOrderBy(sort),
			sort,
			albumCtx: album,
		};
	}
	const a = await requireAccessibleAlbum(ctx, album);
	const sort: PhotoSort =
		a.photoSortCol && (PHOTO_SORT_COLS as readonly string[]).includes(a.photoSortCol)
			? { col: a.photoSortCol as PhotoSortCol, order: a.photoSortOrder === "desc" ? "desc" : "asc" }
			: await defaultPhotoSort();
	let where: SQL;
	if (a.kind === "tag") {
		const rows = await ctx.db
			.select({ tagId: tagAlbumTags.tagId })
			.from(tagAlbumTags)
			.where(eq(tagAlbumTags.albumId, a.id));
		where = sql`(${tagMembership(
			rows.map((r) => r.tagId),
			a.tagLogic,
		)}) and (${photoVisible(v)})`;
	} else {
		// Accessibility of the album is the gate: every photo in an accessible album is visible.
		where = sql`photos.id in (select sc.photo_id from photo_album sc where sc.album_id = ${a.id})`;
	}
	return { where, orderBy: photoOrderBy(sort), sort, albumCtx: a.id };
}

/** Columns of a ratios listing (select from photos). */
export function ratioColumns(bucket: SQL<string>) {
	return {
		id: photos.id,
		width: photos.width,
		height: photos.height,
		bucket,
		title: photos.title,
		type: photos.type,
		isHighlighted: photos.isHighlighted,
		ratingAvg: photos.ratingAvg,
		takenAt: photos.takenAt,
		createdAt: photos.createdAt,
		colour: sql<string | null>`${photos.colours}[1]`,
	};
}

type RatioRow = {
	id: string;
	width: number;
	height: number;
	bucket: string;
	title: string;
	type: "image" | "video";
	isHighlighted: boolean;
	ratingAvg: number | null;
	takenAt: string | null;
	createdAt: string;
	colour: string | null;
};

export function toRatiosSoA(rows: RatioRow[], isTruncated: boolean): PhotoRatiosSoA {
	return {
		ids: rows.map((r) => r.id),
		ratios: rows.map((r) => (r.width > 0 && r.height > 0 ? r.width / r.height : 1)),
		bucketIds: rows.map((r) => r.bucket),
		titles: rows.map((r) => r.title),
		types: rows.map((r) => r.type),
		isHighlighteds: rows.map((r) => r.isHighlighted),
		ratingAvgs: rows.map((r) => (r.ratingAvg === null ? null : Number(r.ratingAvg))),
		takenAts: rows.map((r) => iso(r.takenAt)),
		createdAts: rows.map((r) => iso(r.createdAt)),
		colours: rows.map((r) => r.colour ?? null),
		isTruncated,
	};
}
