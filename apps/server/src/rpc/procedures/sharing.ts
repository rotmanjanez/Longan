import type { ShareGrant } from "@longan/shared";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";
import { accessPermissions, albums, users } from "../../db/schema.ts";
import { os } from "../base.ts";
import { type Ctx, requireUser } from "../context.ts";
import { loadAlbums, ownsOrAdmin } from "./gallery-common.ts";

/** Albums the viewer may share: own albums (admin: all). Throws FORBIDDEN otherwise. */
async function requireShareable(ctx: Ctx, albumIds: string[]) {
	const list = await loadAlbums(ctx.db, albumIds);
	for (const a of list) if (!ownsOrAdmin(ctx.viewer, a)) throw new ORPCError("FORBIDDEN");
	return list;
}

async function grantRows(ctx: Ctx, where: SQL | undefined) {
	const ap = accessPermissions;
	return ctx.db
		.select({
			id: ap.id,
			albumId: ap.albumId,
			albumTitle: albums.title,
			grantsFullPhotoAccess: ap.grantsFullPhotoAccess,
			grantsDownload: ap.grantsDownload,
			grantsUpload: ap.grantsUpload,
			grantsEdit: ap.grantsEdit,
			grantsDelete: ap.grantsDelete,
			grantsMove: ap.grantsMove,
			userId: users.id,
			username: users.username,
			displayName: users.displayName,
		})
		.from(ap)
		.innerJoin(users, eq(users.id, ap.userId))
		.innerJoin(albums, eq(albums.id, ap.albumId))
		.where(and(isNotNull(ap.userId), where))
		.orderBy(albums.title, users.username);
}

type GrantRow = Awaited<ReturnType<typeof grantRows>>[number];

function toGrant(r: GrantRow): ShareGrant {
	return {
		id: r.id,
		albumId: r.albumId,
		grantsFullPhotoAccess: r.grantsFullPhotoAccess,
		grantsDownload: r.grantsDownload,
		grantsUpload: r.grantsUpload,
		grantsEdit: r.grantsEdit,
		grantsDelete: r.grantsDelete,
		grantsMove: r.grantsMove,
		user: { id: r.userId, username: r.username, displayName: r.displayName },
	};
}

/** Load per-user grant rows by id and check the viewer may share their albums. */
async function requireGrantRows(ctx: Ctx, ids: number[]) {
	const uniq = [...new Set(ids)];
	const rows = await ctx.db
		.select({ id: accessPermissions.id, albumId: accessPermissions.albumId })
		.from(accessPermissions)
		.where(and(inArray(accessPermissions.id, uniq), isNotNull(accessPermissions.userId)));
	if (rows.length !== uniq.length) throw new ORPCError("NOT_FOUND", { message: "Share not found" });
	await requireShareable(
		ctx,
		rows.map((r) => r.albumId),
	);
	return uniq;
}

export const sharing = os.sharing.router({
	list: os.sharing.list.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		await requireShareable(ctx, [input.albumId]);
		const rows = await grantRows(ctx, eq(accessPermissions.albumId, input.albumId));
		return rows.map(toGrant);
	}),

	listAll: os.sharing.listAll.handler(async ({ context: ctx }) => {
		const user = requireUser(ctx);
		const rows = await grantRows(ctx, ctx.viewer.isAdmin ? undefined : eq(albums.ownerId, user.id));
		return rows.map((r) => ({ ...toGrant(r), albumTitle: r.albumTitle }));
	}),

	add: os.sharing.add.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const list = await requireShareable(ctx, input.albumIds);
		const userIds = [...new Set(input.userIds)];
		const found = await ctx.db.select({ id: users.id }).from(users).where(inArray(users.id, userIds));
		if (found.length !== userIds.length) throw new ORPCError("NOT_FOUND", { message: "User not found" });
		const g = input.grants;
		const values = list.flatMap((a) =>
			userIds
				// Sharing an album with its owner is meaningless.
				.filter((u) => u !== a.ownerId)
				.map(
					(u) =>
						sql`(${a.id}, ${u}, ${g.grantsFullPhotoAccess}, ${g.grantsDownload}, ${g.grantsUpload}, ${g.grantsEdit}, ${g.grantsDelete}, ${g.grantsMove})`,
				),
		);
		if (values.length === 0) return;
		await ctx.db.execute(sql`
			insert into access_permissions (album_id, user_id, grants_full_photo_access, grants_download, grants_upload,
				grants_edit, grants_delete, grants_move)
			values ${sql.join(values, sql`, `)}
			on conflict (album_id, coalesce(user_id, 0)) do update set
				grants_full_photo_access = excluded.grants_full_photo_access,
				grants_download = excluded.grants_download,
				grants_upload = excluded.grants_upload,
				grants_edit = excluded.grants_edit,
				grants_delete = excluded.grants_delete,
				grants_move = excluded.grants_move,
				updated_at = now()`);
	}),

	update: os.sharing.update.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		await requireGrantRows(ctx, [input.id]);
		await ctx.db
			.update(accessPermissions)
			.set({ ...input.grants, updatedAt: sql`now()` })
			.where(eq(accessPermissions.id, input.id));
	}),

	remove: os.sharing.remove.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const ids = await requireGrantRows(ctx, input.ids);
		await ctx.db.delete(accessPermissions).where(inArray(accessPermissions.id, ids));
	}),
});
