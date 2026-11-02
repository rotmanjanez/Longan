/**
 * Search. Term grammar (whitespace separated, values may be "quoted"):
 * - free words: every word must match the title, description or a tag name (ILIKE, substring)
 * - `tag:x` photo has a tag named x (case-insensitive, exact)
 * - `type:image|video`
 * - `date:YYYY[-MM[-DD]]` prefix of COALESCE(taken_at, created_at) in UTC
 * - `color:#rrggbb` one of the photo's dominant colours lies within an RGB Euclidean distance of
 *   COLOUR_DISTANCE (decoded from hex in SQL)
 * - `make:x` / `model:x` substring, case-insensitive
 * - `license:x` exact, case-insensitive
 * - `rating:>=n` (also >, <, <=, = or a bare number meaning >=) on the average rating
 */
import { ORPCError } from "@orpc/server";
import { type SQL, sql } from "drizzle-orm";
import { photos } from "../../db/schema.ts";
import { albumListed, photoVisible } from "../../policy/index.ts";
import { settingBool } from "../../settings/index.ts";
import { os } from "../base.ts";
import type { Ctx } from "../context.ts";
import { albumTiles } from "./album-tiles.ts";
import {
	A,
	accessibleSubtree,
	likeEscape,
	requireAccessibleAlbum,
	requireSiteAccess,
} from "./gallery-common.ts";
import { nsfwExclusion, photoOrderBy, ratioColumns, toRatiosSoA } from "./photo-scope.ts";

export const COLOUR_DISTANCE = 48;

export type SearchToken = { key: string | null; value: string };

const MODIFIERS = new Set(["tag", "type", "date", "color", "colour", "make", "model", "license", "rating"]);

export function tokenize(term: string): SearchToken[] {
	const out: SearchToken[] = [];
	const re = /(\w+):"([^"]*)"|"([^"]*)"|(\S+)/g;
	for (const m of term.matchAll(re)) {
		if (m[1] !== undefined) {
			const key = m[1].toLowerCase();
			if (MODIFIERS.has(key)) out.push({ key, value: m[2] ?? "" });
			else out.push({ key: null, value: `${m[1]}:${m[2] ?? ""}` });
		} else if (m[3] !== undefined) {
			out.push({ key: null, value: m[3] });
		} else if (m[4] !== undefined) {
			const mm = /^(\w+):(.+)$/.exec(m[4]);
			const key = mm?.[1]?.toLowerCase();
			if (mm && key && MODIFIERS.has(key)) out.push({ key, value: mm[2] ?? "" });
			else out.push({ key: null, value: m[4] });
		}
	}
	return out.filter((t) => t.value.trim().length > 0);
}

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}

/** SQL condition on the photos table for one token. */
export function tokenCondition(t: SearchToken): SQL {
	const v = t.value.trim();
	switch (t.key) {
		case null: {
			const p = `%${likeEscape(v)}%`;
			return sql`(photos.title ilike ${p} or photos.description ilike ${p} or exists (select 1 from photo_tags sw join tags swt on swt.id = sw.tag_id where sw.photo_id = photos.id and swt.name ilike ${p}))`;
		}
		case "tag":
			return sql`exists (select 1 from photo_tags sw join tags swt on swt.id = sw.tag_id where sw.photo_id = photos.id and lower(swt.name) = lower(${v}))`;
		case "type": {
			const type = v.toLowerCase();
			if (type !== "image" && type !== "video") bad("type: must be image or video");
			return sql`photos.type = ${type}`;
		}
		case "date":
			if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)) bad("date: must be YYYY, YYYY-MM or YYYY-MM-DD");
			return sql`to_char(coalesce(photos.taken_at, photos.created_at) at time zone 'UTC', 'YYYY-MM-DD') like ${`${v}%`}`;
		case "color":
		case "colour": {
			const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
			if (!m) bad("color: must be #rrggbb");
			const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h ?? "0", 16));
			const ch = (pos: number) => sql`('x' || substr(c, ${pos}::int, 2))::bit(8)::int`;
			return sql`exists (select 1 from unnest(photos.colours) as c where c ~* '^#[0-9a-f]{6}$' and
				power(${ch(2)} - ${r}::int, 2) + power(${ch(4)} - ${g}::int, 2) + power(${ch(6)} - ${b}::int, 2) <= ${COLOUR_DISTANCE * COLOUR_DISTANCE}::int)`;
		}
		case "make":
			return sql`photos.make ilike ${`%${likeEscape(v)}%`}`;
		case "model":
			return sql`photos.model ilike ${`%${likeEscape(v)}%`}`;
		case "license":
			return sql`lower(photos.license) = lower(${v})`;
		case "rating": {
			const m = /^(>=|<=|>|<|=)?\s*([0-5](?:\.\d+)?)$/.exec(v);
			if (!m) bad("rating: must look like >=3");
			const op = sql.raw(m[1] ?? ">=");
			return sql`photos.rating_avg ${op} ${Number(m[2])}::real`;
		}
		default:
			return bad(`unknown modifier ${t.key}`);
	}
}

async function requireSearch(ctx: Ctx) {
	await requireSiteAccess(ctx);
	if (ctx.viewer.userId === null && !(await settingBool("features.search", true))) {
		throw new ORPCError("UNAUTHORIZED");
	}
}

export const search = os.search.router({
	photos: os.search.photos.handler(async ({ input, context: ctx }) => {
		await requireSearch(ctx);
		const v = ctx.viewer;
		const tokens = tokenize(input.term);
		if (tokens.length === 0) bad("Empty search");
		const conds: SQL[] = tokens.map(tokenCondition);
		conds.push(photoVisible(v));
		if (input.album) {
			const album = await requireAccessibleAlbum(ctx, input.album);
			conds.push(
				sql`photos.id in (select sa.photo_id from photo_album sa where sa.album_id in ${accessibleSubtree(v, album.id)})`,
			);
		} else {
			const nsfw = await nsfwExclusion();
			if (nsfw) conds.push(nsfw);
		}
		const rows = await ctx.db
			.select(ratioColumns(sql<string>`'all'`))
			.from(photos)
			.where(
				sql.join(
					conds.map((c) => sql`(${c})`),
					sql` and `,
				),
			)
			.orderBy(...photoOrderBy({ col: "taken_at", order: "desc" }))
			.limit(input.limit + 1);
		const truncated = rows.length > input.limit;
		return toRatiosSoA(truncated ? rows.slice(0, input.limit) : rows, truncated);
	}),

	albums: os.search.albums.handler(async ({ input, context: ctx }) => {
		await requireSearch(ctx);
		const words = tokenize(input.term)
			.filter((t) => t.key === null)
			.map((t) => `%${likeEscape(t.value.trim())}%`);
		if (words.length === 0) return [];
		const match = sql.join(
			words.map((w) => sql`(a.title ilike ${w} or a.description ilike ${w})`),
			sql` and `,
		);
		return albumTiles(
			ctx,
			sql`${match} and ${albumListed(ctx.viewer, A)}`,
			{ col: "title", order: "asc" },
			200,
		);
	}),
});
