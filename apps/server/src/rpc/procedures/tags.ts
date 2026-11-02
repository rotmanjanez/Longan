import { ORPCError } from "@orpc/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { photoTags, tags as tagsTable } from "../../db/schema.ts";
import { photoGrant, photoVisible, type Viewer } from "../../policy/index.ts";
import { os } from "../base.ts";
import { requireUpload, requireUser } from "../context.ts";
import {
	deleteOrphanTags,
	findOrCreateTags,
	inList,
	isUniqueViolation,
	type Q,
	requirePhotoGrant,
	requireSiteAccess,
} from "./gallery-common.ts";

/*
 * Tags are global. Admins rename/merge/delete them globally; other uploaders only re-point the usages they
 * control (photos they can edit, tag albums they own), like Lychee's per-user scoped tag operations.
 */

function ownedAlbum(v: Viewer) {
	return v.isAdmin ? sql`true` : sql`a.owner_id = ${v.userId ?? -1}`;
}

/** Move usages of `sourceIds` (within the viewer's reach) to `targetId`, then drop orphaned tags. */
async function repoint(db: Q, v: Viewer, sourceIds: number[], targetId: number) {
	const src = inList(sourceIds);
	const editable = photoGrant(v, "grantsEdit");
	await db.execute(sql`
		insert into photo_tags (photo_id, tag_id)
		select distinct pt.photo_id, ${targetId}::int from photo_tags pt join photos on photos.id = pt.photo_id
		where pt.tag_id in ${src} and ${editable}
		on conflict do nothing`);
	await db.execute(sql`
		delete from photo_tags pt using photos
		where photos.id = pt.photo_id and pt.tag_id in ${src} and ${editable}`);
	await db.execute(sql`
		insert into tag_album_tags (album_id, tag_id)
		select distinct tat.album_id, ${targetId}::int from tag_album_tags tat join albums a on a.id = tat.album_id
		where tat.tag_id in ${src} and ${ownedAlbum(v)}
		on conflict do nothing`);
	await db.execute(sql`
		delete from tag_album_tags tat using albums a
		where a.id = tat.album_id and tat.tag_id in ${src} and ${ownedAlbum(v)}`);
	await deleteOrphanTags(db);
}

/** True when the tag is used by photos the viewer cannot edit or by tag albums of other users. */
async function hasForeignUsage(db: Q, v: Viewer, tagId: number): Promise<boolean> {
	if (v.isAdmin) return false;
	const [row] = await db.execute<{ is_foreign: boolean }>(sql`
		select (
			exists (select 1 from photo_tags pt join photos on photos.id = pt.photo_id where pt.tag_id = ${tagId} and not ${photoGrant(v, "grantsEdit")})
			or exists (select 1 from tag_album_tags tat join albums a on a.id = tat.album_id where tat.tag_id = ${tagId} and not ${ownedAlbum(v)})
		) as is_foreign`);
	return Boolean(row?.is_foreign);
}

async function requireTags(db: Q, ids: number[]) {
	const uniq = [...new Set(ids)];
	const rows = await db.select().from(tagsTable).where(inArray(tagsTable.id, uniq));
	if (rows.length !== uniq.length) throw new ORPCError("NOT_FOUND", { message: "Tag not found" });
	return rows;
}

export const tags = os.tags.router({
	list: os.tags.list.handler(async ({ context: ctx }) => {
		await requireSiteAccess(ctx);
		const v = ctx.viewer;
		const rows = v.isAdmin
			? await ctx.db.execute<{ id: number; name: string; count: number }>(sql`
				select t.id, t.name, count(pt.photo_id)::int as count from tags t
				left join photo_tags pt on pt.tag_id = t.id group by t.id order by lower(t.name)`)
			: await ctx.db.execute<{ id: number; name: string; count: number }>(sql`
				select t.id, t.name, count(*)::int as count from tags t
				join photo_tags pt on pt.tag_id = t.id join photos on photos.id = pt.photo_id
				where ${photoVisible(v)} group by t.id order by lower(t.name)`);
		return rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) }));
	}),

	rename: os.tags.rename.handler(async ({ input, context: ctx }) => {
		requireUpload(ctx);
		const v = ctx.viewer;
		const name = input.name.trim();
		if (!name) throw new ORPCError("BAD_REQUEST", { message: "Empty tag name" });
		await requireTags(ctx.db, [input.id]);
		try {
			await ctx.db.transaction(async (tx) => {
				const [collision] = await tx
					.select({ id: tagsTable.id })
					.from(tagsTable)
					.where(and(sql`lower(${tagsTable.name}) = lower(${name})`, ne(tagsTable.id, input.id)));
				if (!collision && !(await hasForeignUsage(tx, v, input.id))) {
					await tx.update(tagsTable).set({ name }).where(eq(tagsTable.id, input.id));
					return;
				}
				// Name taken: merge into the existing tag. Shared usage: split off the viewer's usages.
				const targetId =
					collision?.id ??
					(await tx.insert(tagsTable).values({ name }).returning({ id: tagsTable.id }))[0]?.id;
				if (targetId === undefined) throw new ORPCError("INTERNAL_SERVER_ERROR");
				await repoint(tx, v, [input.id], targetId);
			});
		} catch (err) {
			if (isUniqueViolation(err)) throw new ORPCError("CONFLICT", { message: "Tag name already exists" });
			throw err;
		}
	}),

	merge: os.tags.merge.handler(async ({ input, context: ctx }) => {
		requireUpload(ctx);
		const sources = input.sourceIds.filter((id) => id !== input.targetId);
		await requireTags(ctx.db, [...sources, input.targetId]);
		if (sources.length === 0) return;
		await ctx.db.transaction((tx) => repoint(tx, ctx.viewer, sources, input.targetId));
	}),

	delete: os.tags.delete.handler(async ({ input, context: ctx }) => {
		requireUpload(ctx);
		const v = ctx.viewer;
		const ids = (await requireTags(ctx.db, input.ids)).map((t) => t.id);
		await ctx.db.transaction(async (tx) => {
			if (v.isAdmin) {
				await tx.delete(tagsTable).where(inArray(tagsTable.id, ids));
				return;
			}
			await tx.execute(sql`
				delete from photo_tags pt using photos
				where photos.id = pt.photo_id and pt.tag_id in ${inList(ids)} and ${photoGrant(v, "grantsEdit")}`);
			await tx.execute(sql`
				delete from tag_album_tags tat using albums a
				where a.id = tat.album_id and tat.tag_id in ${inList(ids)} and ${ownedAlbum(v)}`);
			await deleteOrphanTags(tx);
		});
	}),

	attach: os.tags.attach.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const photoIds = await requirePhotoGrant(ctx, input.photoIds, "grantsEdit");
		await ctx.db.transaction(async (tx) => {
			const tagIds = await findOrCreateTags(tx, input.names);
			if (tagIds.length === 0) return;
			await tx
				.insert(photoTags)
				.values(photoIds.flatMap((photoId) => tagIds.map((tagId) => ({ photoId, tagId }))))
				.onConflictDoNothing();
		});
	}),

	detach: os.tags.detach.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const photoIds = await requirePhotoGrant(ctx, input.photoIds, "grantsEdit");
		await ctx.db.transaction(async (tx) => {
			await tx
				.delete(photoTags)
				.where(and(inArray(photoTags.photoId, photoIds), inArray(photoTags.tagId, input.tagIds)));
			await deleteOrphanTags(tx);
		});
	}),
});
