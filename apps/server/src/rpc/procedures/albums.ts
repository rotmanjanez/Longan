import {
	type AlbumHead,
	type AlbumRights,
	AlbumSortCol,
	isSmartAlbumId,
	type License,
	type PhotoLayout,
	PhotoSortCol,
	type SmartAlbumId,
	type SortOrder,
} from "@longan/shared";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createSession, sessionCookieHeader, unlockAlbums } from "../../auth/session.ts";
import {
	type Album,
	accessPermissions,
	albums as albumsTable,
	photos,
	tagAlbumTags,
	tags,
	users,
} from "../../db/schema.ts";
import { newId } from "../../lib/ids.ts";
import { log } from "../../lib/log.ts";
import { albumAccessible, albumListed, albumRightsFor } from "../../policy/index.ts";
import { settingBool, settingStr } from "../../settings/index.ts";
import { os } from "../base.ts";
import { type Ctx, requireUpload, requireUser } from "../context.ts";
import { albumTiles, childAlbumSort, defaultAlbumSort, smartStats, smartTiles } from "./album-tiles.ts";
import {
	A,
	deleteOrphanTags,
	findOrCreateTags,
	inList,
	iso,
	isUniqueViolation,
	loadAlbums,
	mediaDeletePhotos,
	ownsOrAdmin,
	passwordProtectedRows,
	publicRow,
	type Q,
	requireAccessibleAlbum,
	requireSiteAccess,
} from "./gallery-common.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { photoScope, SMART_TITLES, smartAllowed } from "./photo-scope.ts";

/** Ids of the given albums and all their descendants. */

/**
 * Ancestors (root first) the viewer can walk up to from the album: stops at the first parent they cannot open,
 * so a link never skips over an inaccessible level. A shared sub-album of a private parent gets no crumbs.
 */
export function reachableCrumbs(rows: readonly { id: string; title: string; ok: boolean }[]) {
	const out: { id: string; title: string }[] = [];
	for (let i = rows.length - 1; i >= 0; i--) {
		const r = rows[i]!;
		if (!r.ok) break;
		out.unshift({ id: r.id, title: r.title });
	}
	return out;
}

export async function subtreeIds(db: Q, ids: string[]): Promise<string[]> {
	if (ids.length === 0) return [];
	const rows = await db.execute<{ id: string }>(sql`
		with recursive t as (
			select id from albums where id in ${inList(ids)}
			union
			select c.id from albums c join t on c.parent_id = t.id
		) select id from t`);
	return rows.map((r) => r.id);
}

async function rightsOrForbid(
	ctx: Ctx,
	album: Album,
	need: (r: AlbumRights) => boolean,
): Promise<AlbumRights> {
	const rights = await albumRightsFor(ctx.db, ctx.viewer, album);
	if (!need(rights)) throw new ORPCError("FORBIDDEN");
	return rights;
}

async function smartHead(ctx: Ctx, id: SmartAlbumId): Promise<AlbumHead> {
	await requireSiteAccess(ctx);
	if (!(await smartAllowed(id, ctx.viewer))) {
		throw new ORPCError(ctx.viewer.userId === null ? "UNAUTHORIZED" : "NOT_FOUND");
	}
	const s = await smartStats(ctx, id);
	const v = ctx.viewer;
	return {
		id,
		kind: "smart",
		title: SMART_TITLES[id],
		description: null,
		ownerId: null,
		ownerName: null,
		parentId: null,
		breadcrumbs: [],
		coverId: s.coverId,
		isNsfw: false,
		license: null,
		slug: null,
		createdAt: null,
		publishedAt: null,
		numPhotos: s.numPhotos,
		numChildren: 0,
		minTakenAt: s.minTakenAt,
		maxTakenAt: s.maxTakenAt,
		photoSorting: null,
		albumSorting: null,
		photoLayout: null,
		protection: null,
		tags: [],
		tagLogic: null,
		// Per-photo rights still apply (details/asset); these only drive the album toolbar.
		rights: {
			canEdit: false,
			canDelete: false,
			canMove: false,
			canUpload: id === "unsorted" && v.mayUpload,
			canDownload: v.userId !== null,
			canShare: false,
			canAccessFullPhoto: v.userId !== null,
		},
	};
}

function sorting<T extends string>(col: string | null, order: string | null, cols: readonly T[]) {
	if (!col || !(cols as readonly string[]).includes(col)) return null;
	return { col: col as T, order: (order === "desc" ? "desc" : "asc") as SortOrder };
}

export const albums = os.albums.router({
	root: os.albums.root.handler(async ({ context: ctx }) => {
		await requireSiteAccess(ctx);
		const v = ctx.viewer;
		const sort = await defaultAlbumSort();
		const uid = v.userId;
		const hasUserGrant = (u: number) =>
			sql`exists (select 1 from access_permissions x where x.album_id = a.id and x.user_id = ${u})`;
		// Top level: own albums and public ones (admin: all). Albums shared with the viewer go to `shared`.
		const topFilter = v.isAdmin
			? sql`true`
			: uid === null
				? sql`exists (select 1 from access_permissions x where x.album_id = a.id and x.user_id is null)`
				: sql`(a.owner_id = ${uid} or (exists (select 1 from access_permissions x where x.album_id = a.id and x.user_id is null) and not ${hasUserGrant(uid)}))`;
		const [smart, top, shared, tagAlbums] = await Promise.all([
			smartTiles(ctx),
			albumTiles(
				ctx,
				sql`a.kind = 'album' and a.parent_id is null and ${albumListed(v, A)} and ${topFilter}`,
				sort,
			),
			uid === null
				? Promise.resolve([])
				: albumTiles(ctx, sql`a.kind = 'album' and a.owner_id <> ${uid} and ${hasUserGrant(uid)}`, sort),
			albumTiles(ctx, sql`a.kind = 'tag' and ${albumListed(v, A)}`, { col: "title", order: "asc" }),
		]);
		return { smart, albums: top, shared, tagAlbums };
	}),

	head: os.albums.head.handler(async ({ input, context: ctx }) => {
		if (isSmartAlbumId(input.id)) return smartHead(ctx, input.id);
		const v = ctx.viewer;
		const album = await requireAccessibleAlbum(ctx, input.id);
		const [rights, [tile], [counts], crumbs, [owner]] = await Promise.all([
			albumRightsFor(ctx.db, v, album),
			albumTiles(ctx, sql`a.id = ${album.id}`, { col: "title", order: "asc" }),
			ctx.db.execute<{ n: number }>(
				sql`select count(*)::int as n from albums a where a.parent_id = ${album.id} and ${albumListed(v, A)}`,
			),
			ctx.db.execute<{ id: string; title: string; ok: boolean }>(sql`
				with recursive up as (
					select id, parent_id, owner_id, title, 0 as depth from albums where id = ${album.parentId ?? ""}
					union all
					select a.id, a.parent_id, a.owner_id, a.title, up.depth + 1 from albums a join up on a.id = up.parent_id
				)
				select up.id, up.title, ${albumAccessible(v, { id: sql`up.id`, ownerId: sql`up.owner_id` })} as ok
				from up order by up.depth desc`),
			ctx.db.select({ name: users.displayName }).from(users).where(eq(users.id, album.ownerId)),
		]);
		let protection: AlbumHead["protection"] = null;
		if (rights.canEdit) {
			const pub = await publicRow(ctx.db, album.id);
			protection = {
				isPublic: pub !== null,
				isLinkRequired: pub?.isLinkRequired ?? false,
				hasPassword: pub?.passwordHash != null,
				grantsFullPhotoAccess: pub?.grantsFullPhotoAccess ?? false,
				grantsDownload: pub?.grantsDownload ?? false,
				grantsUpload: pub?.grantsUpload ?? false,
			};
		}
		const albumTags =
			album.kind === "tag"
				? await ctx.db
						.select({ id: tags.id, name: tags.name })
						.from(tagAlbumTags)
						.innerJoin(tags, eq(tags.id, tagAlbumTags.tagId))
						.where(eq(tagAlbumTags.albumId, album.id))
						.orderBy(tags.name)
				: [];
		return {
			id: album.id,
			kind: album.kind,
			title: album.title,
			description: album.description,
			ownerId: album.ownerId,
			ownerName: owner?.name ?? null,
			parentId: album.parentId,
			breadcrumbs: reachableCrumbs(crumbs),
			coverId: album.coverId,
			isNsfw: album.isNsfw,
			license: (album.license as License | null) ?? null,
			slug: album.slug,
			createdAt: iso(album.createdAt),
			publishedAt: iso(album.publishedAt),
			numPhotos: tile?.numPhotos ?? 0,
			numChildren: Number(counts?.n ?? 0),
			minTakenAt: tile?.minTakenAt ?? null,
			maxTakenAt: tile?.maxTakenAt ?? null,
			photoSorting: sorting(album.photoSortCol, album.photoSortOrder, PhotoSortCol.options),
			albumSorting: sorting(album.albumSortCol, album.albumSortOrder, AlbumSortCol.options),
			photoLayout: (album.photoLayout as PhotoLayout | null) ?? null,
			protection,
			tags: albumTags,
			tagLogic: album.kind === "tag" ? album.tagLogic : null,
			rights,
		};
	}),

	children: os.albums.children.handler(async ({ input, context: ctx }) => {
		const album = await requireAccessibleAlbum(ctx, input.id);
		if (album.kind !== "album") return [];
		return albumTiles(
			ctx,
			sql`a.parent_id = ${album.id} and ${albumListed(ctx.viewer, A)}`,
			await childAlbumSort(album),
		);
	}),

	tree: os.albums.tree.handler(async ({ context: ctx }) => {
		const v = ctx.viewer;
		if (v.userId === null && !v.isAdmin) return { ids: [], titles: [], parentIds: [] };
		const filter = v.isAdmin
			? sql`true`
			: sql`(a.owner_id = ${v.userId} or exists (select 1 from access_permissions x where x.album_id = a.id and x.user_id = ${v.userId} and x.grants_edit))`;
		const rows = await ctx.db.execute<{ id: string; title: string; parent_id: string | null }>(
			sql`select a.id, a.title, a.parent_id from albums a where a.kind = 'album' and ${filter} order by a.title, a.id`,
		);
		const ids = new Set(rows.map((r) => r.id));
		return {
			ids: rows.map((r) => r.id),
			titles: rows.map((r) => r.title),
			// Parents outside the editable set are presented as roots.
			parentIds: rows.map((r) => (r.parent_id && ids.has(r.parent_id) ? r.parent_id : null)),
		};
	}),

	create: os.albums.create.handler(async ({ input, context: ctx }) => {
		const user = requireUser(ctx);
		let parent: Album | null = null;
		if (input.kind === "tag") {
			if (input.parentId) throw new ORPCError("BAD_REQUEST", { message: "Tag albums live at the root" });
			requireUpload(ctx);
		} else if (input.parentId) {
			parent = await requireAccessibleAlbum(ctx, input.parentId);
			if (parent.kind !== "album")
				throw new ORPCError("BAD_REQUEST", { message: "Tag albums have no children" });
			await rightsOrForbid(ctx, parent, (r) => r.canUpload);
		} else {
			requireUpload(ctx);
		}
		const protection = await settingStr("albums.default_protection", "private");
		const license = await settingStr("albums.default_license", "none");
		const grantsFull = await settingBool("albums.public_grants_full_photo", true);
		const grantsDownload = await settingBool("albums.public_grants_download", false);
		const id = newId();
		await ctx.db.transaction(async (tx) => {
			await tx.insert(albumsTable).values({
				id,
				kind: input.kind,
				parentId: parent?.id ?? null,
				ownerId: user.id,
				title: input.title,
				license,
				tagLogic: input.tagLogic,
			});
			if (input.kind === "tag") {
				const tagIds = await findOrCreateTags(tx, input.tagNames);
				if (tagIds.length)
					await tx.insert(tagAlbumTags).values(tagIds.map((tagId) => ({ albumId: id, tagId })));
			}
			if (protection === "public" || protection === "public_hidden") {
				await tx.insert(accessPermissions).values({
					albumId: id,
					userId: null,
					isLinkRequired: protection === "public_hidden",
					grantsFullPhotoAccess: grantsFull,
					grantsDownload,
				});
			} else if (protection === "inherit" && parent) {
				await tx.execute(sql`
					insert into access_permissions (album_id, user_id, is_link_required, password_hash, grants_full_photo_access,
						grants_download, grants_upload, grants_edit, grants_delete, grants_move)
					select ${id}, user_id, is_link_required, password_hash, grants_full_photo_access,
						grants_download, grants_upload, grants_edit, grants_delete, grants_move
					from access_permissions where album_id = ${parent.id}`);
			}
		});
		return { id };
	}),

	update: os.albums.update.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const album = await requireAccessibleAlbum(ctx, input.id);
		await rightsOrForbid(ctx, album, (r) => r.canEdit);
		const p = input.patch;
		const set: Partial<typeof albumsTable.$inferInsert> = {};
		if (p.title !== undefined) set.title = p.title;
		if (p.description !== undefined) set.description = p.description;
		if (p.license !== undefined) set.license = p.license;
		if (p.slug !== undefined) set.slug = p.slug;
		if (p.photoSorting !== undefined) {
			set.photoSortCol = p.photoSorting?.col ?? null;
			set.photoSortOrder = p.photoSorting?.order ?? null;
		}
		if (p.albumSorting !== undefined) {
			set.albumSortCol = p.albumSorting?.col ?? null;
			set.albumSortOrder = p.albumSorting?.order ?? null;
		}
		if (p.photoLayout !== undefined) set.photoLayout = p.photoLayout;
		if (p.publishedAt !== undefined) set.publishedAt = p.publishedAt === null ? null : iso(p.publishedAt);
		if (p.tagLogic !== undefined) set.tagLogic = p.tagLogic;
		if (p.tagNames !== undefined && album.kind !== "tag") {
			throw new ORPCError("BAD_REQUEST", { message: "Only tag albums have tag criteria" });
		}
		if (p.coverId !== undefined && p.coverId !== null) {
			const scope = await photoScope(ctx, album.id);
			const [hit] = await ctx.db
				.select({ id: photos.id })
				.from(photos)
				.where(and(eq(photos.id, p.coverId), scope.where));
			if (!hit) throw new ORPCError("BAD_REQUEST", { message: "Cover must be a photo of the album" });
		}
		if (p.coverId !== undefined) set.coverId = p.coverId;
		try {
			await ctx.db.transaction(async (tx) => {
				await tx
					.update(albumsTable)
					.set({ ...set, updatedAt: sql`now()` })
					.where(eq(albumsTable.id, album.id));
				if (p.tagNames !== undefined) {
					const tagIds = await findOrCreateTags(tx, p.tagNames);
					await tx.delete(tagAlbumTags).where(eq(tagAlbumTags.albumId, album.id));
					if (tagIds.length) {
						await tx.insert(tagAlbumTags).values(tagIds.map((tagId) => ({ albumId: album.id, tagId })));
					}
					await deleteOrphanTags(tx);
				}
			});
		} catch (err) {
			if (isUniqueViolation(err)) throw new ORPCError("CONFLICT", { message: "Slug already in use" });
			throw err;
		}
	}),

	move: os.albums.move.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const v = ctx.viewer;
		const list = await loadAlbums(ctx.db, input.ids);
		for (const a of list) {
			if (a.kind !== "album") throw new ORPCError("BAD_REQUEST", { message: "Tag albums cannot be moved" });
			await rightsOrForbid(ctx, a, (r) => r.canMove);
			// Moving to the root makes the album top-level for its owner: owner/admin only.
			if (input.targetId === null && !ownsOrAdmin(v, a)) throw new ORPCError("FORBIDDEN");
		}
		if (input.targetId !== null) {
			const target = await requireAccessibleAlbum(ctx, input.targetId);
			if (target.kind !== "album")
				throw new ORPCError("BAD_REQUEST", { message: "Tag albums have no children" });
			await rightsOrForbid(ctx, target, (r) => r.canUpload || r.canEdit);
			const sub = await subtreeIds(ctx.db, input.ids);
			if (sub.includes(target.id)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot move an album into itself or its descendants",
				});
			}
		}
		await ctx.db
			.update(albumsTable)
			.set({ parentId: input.targetId, updatedAt: sql`now()` })
			.where(inArray(albumsTable.id, input.ids));
	}),

	merge: os.albums.merge.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		if (input.ids.includes(input.targetId)) {
			throw new ORPCError("BAD_REQUEST", { message: "Cannot merge an album into itself" });
		}
		const target = await requireAccessibleAlbum(ctx, input.targetId);
		if (target.kind !== "album")
			throw new ORPCError("BAD_REQUEST", { message: "Cannot merge into a tag album" });
		await rightsOrForbid(ctx, target, (r) => r.canEdit);
		const sources = await loadAlbums(ctx.db, input.ids);
		for (const s of sources) {
			if (s.kind !== "album") throw new ORPCError("BAD_REQUEST", { message: "Cannot merge tag albums" });
			await rightsOrForbid(ctx, s, (r) => r.canDelete);
		}
		const sub = await subtreeIds(ctx.db, input.ids);
		if (sub.includes(target.id)) {
			throw new ORPCError("BAD_REQUEST", { message: "Cannot merge an album into its own descendant" });
		}
		await ctx.db.transaction(async (tx) => {
			await tx.execute(sql`
				insert into photo_album (photo_id, album_id)
				select distinct photo_id, ${target.id} from photo_album where album_id in ${inList(input.ids)}
				on conflict do nothing`);
			await tx
				.update(albumsTable)
				.set({ parentId: target.id, updatedAt: sql`now()` })
				.where(inArray(albumsTable.parentId, input.ids));
			await tx.delete(albumsTable).where(inArray(albumsTable.id, input.ids));
		});
	}),

	delete: os.albums.delete.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const list = await loadAlbums(ctx.db, input.ids);
		for (const a of list) await rightsOrForbid(ctx, a, (r) => r.canDelete);
		const sub = await subtreeIds(ctx.db, input.ids);
		const linked = await ctx.db.execute<{ photo_id: string }>(
			sql`select distinct photo_id from photo_album where album_id in ${inList(sub)}`,
		);
		const candidates = linked.map((r) => r.photo_id);
		await ctx.db.delete(albumsTable).where(inArray(albumsTable.id, input.ids));
		if (candidates.length === 0) return;
		// Photos whose last album link went away are deleted with the album.
		const orphans = await ctx.db.execute<{ id: string }>(
			sql`select p.id from photos p where p.id in ${inList(candidates)} and not exists (select 1 from photo_album pa where pa.photo_id = p.id)`,
		);
		const ids = orphans.map((r) => r.id);
		if (ids.length && !(await mediaDeletePhotos(ctx.db, ids))) {
			log.warn("albums.delete: media module unavailable, orphaned photos left unsorted", {
				count: ids.length,
			});
		}
	}),

	setProtection: os.albums.setProtection.handler(async ({ input, context: ctx }) => {
		requireUser(ctx);
		const album = await requireAccessibleAlbum(ctx, input.id);
		await rightsOrForbid(ctx, album, (r) => r.canShare);
		const hash =
			input.password === undefined || input.password === null
				? input.password
				: await hashPassword(input.password);
		await ctx.db.transaction(async (tx) => {
			await tx
				.update(albumsTable)
				.set({ isNsfw: input.isNsfw, updatedAt: sql`now()` })
				.where(eq(albumsTable.id, album.id));
			const where = and(eq(accessPermissions.albumId, album.id), isNull(accessPermissions.userId));
			if (!input.isPublic) {
				await tx.delete(accessPermissions).where(where);
				return;
			}
			const values = {
				isLinkRequired: input.isLinkRequired,
				grantsFullPhotoAccess: input.grantsFullPhotoAccess,
				grantsDownload: input.grantsDownload,
				grantsUpload: input.grantsUpload,
				...(hash !== undefined ? { passwordHash: hash } : {}),
			};
			const existing = await publicRow(tx, album.id);
			if (existing) {
				await tx
					.update(accessPermissions)
					.set({ ...values, updatedAt: sql`now()` })
					.where(eq(accessPermissions.id, existing.id));
			} else {
				await tx.insert(accessPermissions).values({ albumId: album.id, userId: null, ...values });
			}
		});
	}),

	unlock: os.albums.unlock.handler(async ({ input, context: ctx }) => {
		const row = await publicRow(ctx.db, input.id);
		if (!row) throw new ORPCError("NOT_FOUND", { message: "Album not found" });
		if (!row.passwordHash) return;
		if (!(await verifyPassword(input.password, row.passwordHash))) {
			throw new ORPCError("FORBIDDEN", { message: "Wrong password" });
		}
		// Unlock every album protected by the same password (hashes are salted, so verify each).
		const ids = new Set([input.id]);
		for (const other of await passwordProtectedRows(ctx.db)) {
			if (ids.has(other.albumId) || !other.passwordHash) continue;
			if (
				other.passwordHash === row.passwordHash ||
				(await verifyPassword(input.password, other.passwordHash))
			) {
				ids.add(other.albumId);
			}
		}
		let sessionId = ctx.sessionId;
		if (!sessionId) {
			// Guests get an anonymous session whose only purpose is remembering the unlocked albums.
			const session = await createSession(ctx.db, null, null);
			ctx.resHeaders.append("set-cookie", await sessionCookieHeader(session));
			sessionId = session.id;
		}
		await unlockAlbums(ctx.db, sessionId, [...ids]);
	}),
});
