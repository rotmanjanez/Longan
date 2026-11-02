import { isSmartAlbumId } from "@longan/shared";
import { ORPCError } from "@orpc/server";
import { type SQL, sql } from "drizzle-orm";
import { albumAccessible, photoVisible } from "../../policy/index.ts";
import { settingBool } from "../../settings/index.ts";
import { os } from "../base.ts";
import { A, accessibleSubtree, requireAccessibleAlbum, requireSiteAccess } from "./gallery-common.ts";
import { nsfwExclusion, photoScope } from "./photo-scope.ts";

export const map = os.map.router({
	points: os.map.points.handler(async ({ input, context: ctx }) => {
		await requireSiteAccess(ctx);
		const v = ctx.viewer;
		if (v.userId === null && !(await settingBool("features.map", true))) throw new ORPCError("UNAUTHORIZED");
		const conds: SQL[] = [sql`photos.latitude is not null and photos.longitude is not null`];
		const b = input.bounds;
		if (b) {
			conds.push(sql`photos.latitude between ${b.south}::float8 and ${b.north}::float8`);
			conds.push(
				b.west <= b.east
					? sql`photos.longitude between ${b.west}::float8 and ${b.east}::float8`
					: sql`(photos.longitude >= ${b.west}::float8 or photos.longitude <= ${b.east}::float8)`,
			);
		}
		let albumCtx: SQL<string>;
		if (!input.album) {
			conds.push(photoVisible(v));
			const nsfw = await nsfwExclusion();
			if (nsfw) conds.push(nsfw);
			albumCtx = sql<string>`coalesce((select pa.album_id from photo_album pa join albums a on a.id = pa.album_id
				where pa.photo_id = photos.id and ${albumAccessible(v, A)} order by pa.album_id limit 1), 'unsorted')`;
		} else if (isSmartAlbumId(input.album)) {
			const scope = await photoScope(ctx, input.album);
			conds.push(scope.where);
			albumCtx = sql<string>`${scope.albumCtx}::text`;
		} else {
			const album = await requireAccessibleAlbum(ctx, input.album);
			if (album.kind === "tag") {
				const scope = await photoScope(ctx, album.id);
				conds.push(scope.where);
				albumCtx = sql<string>`${album.id}::text`;
			} else {
				const sub = accessibleSubtree(v, album.id);
				conds.push(sql`photos.id in (select mp.photo_id from photo_album mp where mp.album_id in ${sub})`);
				albumCtx = sql<string>`(select mp.album_id from photo_album mp where mp.photo_id = photos.id and mp.album_id in ${sub} order by (mp.album_id = ${album.id}) desc, mp.album_id limit 1)`;
			}
		}
		const rows = await ctx.db.execute<{ id: string; lat: number; lng: number; album: string }>(sql`
			select photos.id, photos.latitude as lat, photos.longitude as lng, ${albumCtx} as album
			from photos
			where ${sql.join(
				conds.map((c) => sql`(${c})`),
				sql` and `,
			)}
			order by coalesce(photos.taken_at, photos.created_at) desc, photos.id
			limit ${input.limit + 1}`);
		const isTruncated = rows.length > input.limit;
		const list = isTruncated ? rows.slice(0, input.limit) : [...rows];
		return {
			ids: list.map((r) => r.id),
			lats: list.map((r) => Number(r.lat)),
			lngs: list.map((r) => Number(r.lng)),
			albumIds: list.map((r) => r.album),
			isTruncated,
		};
	}),
});
