import { type License, type PhotoDetail, THUMB_CLASS_VARIANTS } from "@longan/shared";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
	albums as albumsTable,
	photoAlbum,
	photoRatings,
	photos as photosTable,
	photoTags,
	sizeVariants,
	tags,
} from "../../db/schema.ts";
import { log } from "../../lib/log.ts";
import { albumAccessible, albumRightsFor, photoGrant, photoVisible } from "../../policy/index.ts";
import { settingBool } from "../../settings/index.ts";
import { os } from "../base.ts";
import { type Ctx, requireUser } from "../context.ts";
import {
	A,
	deleteOrphanTags,
	findOrCreateTags,
	inList,
	iso,
	mediaDeletePhotos,
	mediaRotatePhoto,
	ownsOrAdmin,
	requireAccessibleAlbum,
	requirePhotoGrant,
} from "./gallery-common.ts";
import { bucketExpr, bucketLabel, photoScope, ratioColumns, toRatiosSoA } from "./photo-scope.ts";

/** Target album of a move/copy: a regular album where the viewer may upload or edit. */
async function requireTargetAlbum(ctx: Ctx, id: string) {
	const target = await requireAccessibleAlbum(ctx, id);
	if (target.kind !== "album")
		throw new ORPCError("BAD_REQUEST", { message: "Cannot add photos to a tag album" });
	const r = await albumRightsFor(ctx.db, ctx.viewer, target);
	if (!r.canUpload && !r.canEdit) throw new ORPCError("FORBIDDEN");
	return target;
}

async function requireVisiblePhoto(ctx: Ctx, id: string) {
	const [row] = await ctx.db
		.select({ id: photosTable.id })
		.from(photosTable)
		.where(and(eq(photosTable.id, id), photoVisible(ctx.viewer)));
	if (!row) throw new ORPCError("NOT_FOUND", { message: "Photo not found" });
}

export const photos = os.photos.router({
	ratios: os.photos.ratios.handler(async ({ input, context: ctx }) => {
		const scope = await photoScope(ctx, input.album);
		const bucket = bucketExpr(scope.sort, input.granularity);
		const conds = [scope.where];
		if (input.bucketIds) conds.push(sql`${bucket} in ${inList(input.bucketIds)}`);
		if (input.ids) conds.push(inArray(photosTable.id, input.ids));
		const rows = await ctx.db
			.select(ratioColumns(bucket))
			.from(photosTable)
			.where(and(...conds))
			.orderBy(...scope.orderBy);
		return toRatiosSoA(rows, false);
	}),

	buckets: os.photos.buckets.handler(async ({ input, context: ctx }) => {
		const scope = await photoScope(ctx, input.album);
		const bucket = bucketExpr(scope.sort, input.granularity);
		const rows = await ctx.db.execute<{ b: string; n: number }>(sql`
			select b, count(*)::int as n from (
				select ${bucket} as b, row_number() over (order by ${sql.join(scope.orderBy, sql`, `)}) as rn
				from photos where ${scope.where}
			) x group by b order by min(rn)`);
		return {
			ids: rows.map((r) => r.b),
			counts: rows.map((r) => Number(r.n)),
			labels: rows.map((r) => bucketLabel(r.b)),
		};
	}),

	details: os.photos.details.handler(async ({ input, context: ctx }) => {
		const v = ctx.viewer;
		const scope = await photoScope(ctx, input.album);
		const rows = await ctx.db
			.select({
				p: photosTable,
				canEdit: photoGrant(v, "grantsEdit"),
				canDelete: photoGrant(v, "grantsDelete"),
				canMove: photoGrant(v, "grantsMove"),
				canDownload: photoGrant(v, "grantsDownload"),
				canAccessFullPhoto: photoGrant(v, "grantsFullPhotoAccess"),
			})
			.from(photosTable)
			.where(and(scope.where, inArray(photosTable.id, input.ids)))
			.orderBy(...scope.orderBy);
		if (rows.length === 0) return [];
		const ids = rows.map((r) => r.p.id);
		const [tagRows, albumRows, variantRows, ratingRows] = await Promise.all([
			ctx.db
				.select({ photoId: photoTags.photoId, id: tags.id, name: tags.name })
				.from(photoTags)
				.innerJoin(tags, eq(tags.id, photoTags.tagId))
				.where(inArray(photoTags.photoId, ids))
				.orderBy(tags.name),
			ctx.db.execute<{ photo_id: string; id: string; title: string }>(sql`
				select pa.photo_id, a.id, a.title from photo_album pa join albums a on a.id = pa.album_id
				where pa.photo_id in ${inList(ids)} and ${albumAccessible(v, A)} order by a.title`),
			ctx.db.select().from(sizeVariants).where(inArray(sizeVariants.photoId, ids)),
			v.userId === null
				? Promise.resolve([])
				: ctx.db
						.select({ photoId: photoRatings.photoId, rating: photoRatings.rating })
						.from(photoRatings)
						.where(and(inArray(photoRatings.photoId, ids), eq(photoRatings.userId, v.userId))),
		]);
		const group = <T extends { photoId: string }>(list: T[]) => {
			const m = new Map<string, T[]>();
			for (const x of list) m.set(x.photoId, [...(m.get(x.photoId) ?? []), x]);
			return m;
		};
		const tagsBy = group(tagRows);
		const albumsBy = group(albumRows.map((r) => ({ photoId: r.photo_id, id: r.id, title: r.title })));
		const variantsBy = group(variantRows);
		const ratingBy = new Map(ratingRows.map((r) => [r.photoId, r.rating]));
		return rows.map(({ p, ...rights }): PhotoDetail => {
			const full = Boolean(rights.canAccessFullPhoto);
			return {
				id: p.id,
				title: p.title,
				description: p.description,
				type: p.type,
				mime: p.mime,
				filesize: Number(p.filesize),
				width: p.width,
				height: p.height,
				checksum: p.checksum,
				ownerId: p.ownerId,
				takenAt: iso(p.takenAt),
				takenAtTz: p.takenAtTz,
				createdAt: iso(p.createdAt),
				updatedAt: iso(p.updatedAt),
				make: p.make,
				model: p.model,
				lens: p.lens,
				iso: p.iso,
				aperture: p.aperture,
				shutter: p.shutter,
				focal: p.focal,
				latitude: p.latitude,
				longitude: p.longitude,
				altitude: p.altitude,
				license: (p.license as License | null) ?? null,
				isHighlighted: p.isHighlighted,
				ratingAvg: p.ratingAvg,
				myRating: ratingBy.get(p.id) ?? null,
				duration: p.duration,
				fps: p.fps,
				tags: (tagsBy.get(p.id) ?? []).map((t) => ({ id: t.id, name: t.name })),
				colours: p.colours,
				placeholder: p.placeholder,
				sizeVariants: (variantsBy.get(p.id) ?? [])
					.filter((sv) => full || THUMB_CLASS_VARIANTS.includes(sv.type))
					.map((sv) => ({
						type: sv.type,
						width: sv.width,
						height: sv.height,
						filesize: Number(sv.filesize),
					})),
				albums: (albumsBy.get(p.id) ?? []).map((a) => ({ id: a.id, title: a.title })),
				rights: {
					canEdit: Boolean(rights.canEdit),
					canDelete: Boolean(rights.canDelete),
					canMove: Boolean(rights.canMove),
					canDownload: Boolean(rights.canDownload),
					canAccessFullPhoto: full,
				},
			};
		});
	}),

	update: os.photos.update.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const ids = await requirePhotoGrant(ctx, input.ids, "grantsEdit");
		const p = input.patch;
		const set: Partial<typeof photosTable.$inferInsert> = {};
		if (p.title !== undefined) set.title = p.title;
		if (p.description !== undefined) set.description = p.description;
		if (p.license !== undefined) set.license = p.license;
		if (p.takenAt !== undefined) {
			if (p.takenAt !== null && Number.isNaN(Date.parse(p.takenAt))) {
				throw new ORPCError("BAD_REQUEST", { message: "Invalid takenAt" });
			}
			set.takenAt = iso(p.takenAt);
		}
		if (p.takenAtTz !== undefined) set.takenAtTz = p.takenAtTz;
		await ctx.db.transaction(async (tx) => {
			await tx
				.update(photosTable)
				.set({ ...set, updatedAt: sql`now()` })
				.where(inArray(photosTable.id, ids));
			if (p.tagNames !== undefined) {
				const tagIds = await findOrCreateTags(tx, p.tagNames);
				await tx.delete(photoTags).where(inArray(photoTags.photoId, ids));
				if (tagIds.length) {
					await tx
						.insert(photoTags)
						.values(ids.flatMap((photoId) => tagIds.map((tagId) => ({ photoId, tagId }))))
						.onConflictDoNothing();
				}
				await deleteOrphanTags(tx);
			}
		});
	}),

	move: os.photos.move.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const v = ctx.viewer;
		const ids = [...new Set(input.ids)];
		const target = await requireTargetAlbum(ctx, input.toAlbum);
		if (input.fromAlbum !== null) {
			if (input.fromAlbum === target.id) return;
			const from = await requireAccessibleAlbum(ctx, input.fromAlbum);
			const r = await albumRightsFor(ctx.db, v, from);
			if (!r.canMove) throw new ORPCError("FORBIDDEN");
			const linked = await ctx.db
				.select({ id: photoAlbum.photoId })
				.from(photoAlbum)
				.where(and(eq(photoAlbum.albumId, from.id), inArray(photoAlbum.photoId, ids)));
			if (linked.length !== ids.length)
				throw new ORPCError("BAD_REQUEST", { message: "Photo not in source album" });
		} else {
			// From "unsorted": only the owner (or admin) can file their photos.
			const rows = await ctx.db
				.select({ id: photosTable.id, ownerId: photosTable.ownerId })
				.from(photosTable)
				.where(inArray(photosTable.id, ids));
			if (rows.length !== ids.length) throw new ORPCError("NOT_FOUND", { message: "Photo not found" });
			if (rows.some((r) => !ownsOrAdmin(v, r))) throw new ORPCError("FORBIDDEN");
		}
		await ctx.db.transaction(async (tx) => {
			if (input.fromAlbum !== null) {
				await tx
					.delete(photoAlbum)
					.where(and(eq(photoAlbum.albumId, input.fromAlbum), inArray(photoAlbum.photoId, ids)));
			}
			await tx
				.insert(photoAlbum)
				.values(ids.map((photoId) => ({ photoId, albumId: target.id })))
				.onConflictDoNothing();
		});
	}),

	copy: os.photos.copy.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const target = await requireTargetAlbum(ctx, input.toAlbum);
		// Linking exposes the photo through the target album's protection, so it needs edit rights on the photo.
		const ids = await requirePhotoGrant(ctx, input.ids, "grantsEdit");
		await ctx.db
			.insert(photoAlbum)
			.values(ids.map((photoId) => ({ photoId, albumId: target.id })))
			.onConflictDoNothing();
	}),

	delete: os.photos.delete.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const ids = await requirePhotoGrant(ctx, input.ids, "grantsDelete");
		if (!(await mediaDeletePhotos(ctx.db, ids))) {
			log.warn("photos.delete: media module unavailable, deleting rows only (files stay on disk)", {
				count: ids.length,
			});
			await ctx.db.delete(photosTable).where(inArray(photosTable.id, ids));
		}
	}),

	rotate: os.photos.rotate.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		await requirePhotoGrant(ctx, [input.id], "grantsEdit");
		if (!(await mediaRotatePhoto(ctx.db, input.id, input.direction))) {
			throw new ORPCError("NOT_IMPLEMENTED", { message: "Rotation is not available" });
		}
	}),

	highlight: os.photos.highlight.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const ids = await requirePhotoGrant(ctx, input.ids, "grantsEdit");
		await ctx.db
			.update(photosTable)
			.set({ isHighlighted: input.value, updatedAt: sql`now()` })
			.where(inArray(photosTable.id, ids));
	}),

	rate: os.photos.rate.handler(async ({ input, context: ctx }) => {
		const user = requireUser(ctx);
		if (!(await settingBool("features.ratings", true)))
			throw new ORPCError("FORBIDDEN", { message: "Ratings are disabled" });
		await requireVisiblePhoto(ctx, input.id);
		await ctx.db.transaction(async (tx) => {
			if (input.rating === 0) {
				await tx
					.delete(photoRatings)
					.where(and(eq(photoRatings.photoId, input.id), eq(photoRatings.userId, user.id)));
			} else {
				await tx
					.insert(photoRatings)
					.values({ photoId: input.id, userId: user.id, rating: input.rating })
					.onConflictDoUpdate({
						target: [photoRatings.photoId, photoRatings.userId],
						set: { rating: input.rating },
					});
			}
			await tx
				.update(photosTable)
				.set({
					ratingAvg: sql`(select avg(r.rating)::real from photo_ratings r where r.photo_id = ${input.id})`,
				})
				.where(eq(photosTable.id, input.id));
		});
	}),

	albumsOf: os.photos.albumsOf.handler(async ({ input, context: ctx }) => {
		await requireVisiblePhoto(ctx, input.id);
		const rows = await ctx.db.execute<{ id: string; title: string }>(sql`
			select a.id, a.title from photo_album pa join ${albumsTable} a on a.id = pa.album_id
			where pa.photo_id = ${input.id} and ${albumAccessible(ctx.viewer, A)} order by a.title, a.id`);
		return rows.map((r) => ({ id: r.id, title: r.title }));
	}),
});
