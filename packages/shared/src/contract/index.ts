import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	AlbumId,
	AlbumSortCol,
	AnyAlbumId,
	BucketGranularity,
	License,
	PhotoId,
	PhotoLayout,
	PhotoSortCol,
	SizeVariantType,
	SortOrder,
	TagLogic,
} from "../enums.ts";
import {
	AlbumHead,
	AlbumTile,
	GlobalRights,
	Health,
	InitConfig,
	JobRow,
	PhotoBuckets,
	PhotoDetail,
	PhotoRatiosSoA,
	SettingRow,
	ShareGrant,
	ShareGrants,
	TagInfo,
	UserAdmin,
	UserMe,
	UserPublic,
} from "./resources.ts";

export * from "./resources.ts";

/**
 * The single source of truth for the RPC API. The server implements it (`implement(contract)`),
 * the web client is typed from it (`ContractRouterClient<typeof contract>`). Procedures are POST
 * JSON over `/api/rpc`. Binary routes (asset, upload, zip) and auth live on plain Hono routes, see
 * docs/architecture.md.
 *
 * Errors: procedures throw ORPCError with codes UNAUTHORIZED (401, not logged in), FORBIDDEN (403),
 * NOT_FOUND (404), BAD_REQUEST (400/422), CONFLICT (409), and the custom code PASSWORD_REQUIRED (403)
 * when an album needs unlocking.
 */
export const contract = {
	init: {
		get: oc.output(z.object({ user: UserMe.nullable(), rights: GlobalRights, config: InitConfig })),
	},

	albums: {
		/** Root listing: smart albums, the viewer's/public top-level albums, albums shared with the viewer, tag albums. */
		root: oc.output(
			z.object({
				smart: z.array(AlbumTile),
				albums: z.array(AlbumTile),
				shared: z.array(AlbumTile),
				tagAlbums: z.array(AlbumTile),
			}),
		),
		/** `id` is a smart album id, an album id or an album slug. */
		head: oc.input(z.object({ id: z.string().min(1).max(100) })).output(AlbumHead),
		children: oc.input(z.object({ id: AlbumId })).output(z.array(AlbumTile)),
		/**
		 * Flat editable tree for move/merge pickers. Index-aligned. `sameOwnerAs` (album ids) keeps only albums of
		 * the same owner as those albums, i.e. valid move/merge targets for non-admins.
		 */
		tree: oc.input(z.object({ sameOwnerAs: z.array(AlbumId).max(1000).optional() }).optional()).output(
			z.object({
				ids: z.array(AlbumId),
				titles: z.array(z.string()),
				parentIds: z.array(AlbumId.nullable()),
			}),
		),
		create: oc
			.input(
				z.object({
					title: z.string().min(1).max(300),
					parentId: AlbumId.nullable().default(null),
					kind: z.enum(["album", "tag"]).default("album"),
					tagNames: z.array(z.string()).default([]),
					tagLogic: TagLogic.default("or"),
				}),
			)
			.output(z.object({ id: AlbumId })),
		update: oc
			.input(
				z.object({
					id: AlbumId,
					patch: z.object({
						title: z.string().min(1).max(300).optional(),
						description: z.string().nullable().optional(),
						license: License.nullable().optional(),
						slug: z
							.string()
							.regex(/^[a-z0-9-]{1,100}$/)
							.nullable()
							.optional(),
						photoSorting: z.object({ col: PhotoSortCol, order: SortOrder }).nullable().optional(),
						albumSorting: z.object({ col: AlbumSortCol, order: SortOrder }).nullable().optional(),
						photoLayout: PhotoLayout.nullable().optional(),
						coverId: PhotoId.nullable().optional(),
						publishedAt: z.string().nullable().optional(),
						tagNames: z.array(z.string()).optional(),
						tagLogic: TagLogic.optional(),
					}),
				}),
			)
			.output(z.void()),
		move: oc.input(z.object({ ids: z.array(AlbumId).min(1), targetId: AlbumId.nullable() })).output(z.void()),
		merge: oc.input(z.object({ ids: z.array(AlbumId).min(1), targetId: AlbumId })).output(z.void()),
		delete: oc.input(z.object({ ids: z.array(AlbumId).min(1) })).output(z.void()),
		setProtection: oc
			.input(
				z.object({
					id: AlbumId,
					isPublic: z.boolean(),
					isLinkRequired: z.boolean(),
					/** Public access for signed-in users only. undefined = unchanged (false for a newly public album). */
					requiresLogin: z.boolean().optional(),
					isNsfw: z.boolean(),
					/** undefined = unchanged, null = remove password, string = set. */
					password: z.string().min(1).nullable().optional(),
					grantsFullPhotoAccess: z.boolean(),
					grantsDownload: z.boolean(),
					grantsUpload: z.boolean(),
				}),
			)
			.output(z.void()),
		/** Verify an album password; on success the album (and all albums sharing that password) are unlocked for this session. */
		unlock: oc.input(z.object({ id: AlbumId, password: z.string() })).output(z.void()),
	},

	sharing: {
		list: oc.input(z.object({ albumId: AlbumId })).output(z.array(ShareGrant)),
		/** All grants on albums the viewer can share. */
		listAll: oc.output(z.array(ShareGrant.extend({ albumTitle: z.string() }))),
		add: oc
			.input(
				z.object({
					albumIds: z.array(AlbumId).min(1),
					userIds: z.array(z.number().int()).min(1),
					grants: ShareGrants,
				}),
			)
			.output(z.void()),
		update: oc.input(z.object({ id: z.number().int(), grants: ShareGrants })).output(z.void()),
		remove: oc.input(z.object({ ids: z.array(z.number().int()).min(1) })).output(z.void()),
	},

	photos: {
		/** Whole-scope column listing for an album (real, tag or smart). Optionally restricted to buckets or ids. */
		ratios: oc
			.input(
				z.object({
					album: AnyAlbumId,
					bucketIds: z.array(z.string()).max(300).optional(),
					ids: z.array(PhotoId).max(300).optional(),
					granularity: BucketGranularity.default("month"),
				}),
			)
			.output(PhotoRatiosSoA),
		buckets: oc
			.input(z.object({ album: AnyAlbumId, granularity: BucketGranularity.default("month") }))
			.output(PhotoBuckets),
		details: oc
			.input(z.object({ album: AnyAlbumId, ids: z.array(PhotoId).min(1).max(300) }))
			.output(z.array(PhotoDetail)),
		update: oc
			.input(
				z.object({
					ids: z.array(PhotoId).min(1),
					patch: z.object({
						title: z.string().max(300).optional(),
						description: z.string().nullable().optional(),
						license: License.nullable().optional(),
						takenAt: z.string().nullable().optional(),
						takenAtTz: z.string().nullable().optional(),
						/** Replaces the tag set. */
						tagNames: z.array(z.string()).optional(),
					}),
				}),
			)
			.output(z.void()),
		/**
		 * Move photos out of `fromAlbum` into `toAlbum`. `fromAlbum` null (unsorted or a smart album context)
		 * replaces all album memberships with `toAlbum`; `toAlbum` null (unsorted) removes all memberships.
		 */
		move: oc
			.input(
				z.object({
					ids: z.array(PhotoId).min(1),
					fromAlbum: AlbumId.nullable(),
					toAlbum: AlbumId.nullable(),
				}),
			)
			.output(z.void()),
		/** Link photos into an additional album (no file copy). */
		copy: oc.input(z.object({ ids: z.array(PhotoId).min(1), toAlbum: AlbumId })).output(z.void()),
		delete: oc.input(z.object({ ids: z.array(PhotoId).min(1) })).output(z.void()),
		rotate: oc.input(z.object({ id: PhotoId, direction: z.enum(["cw", "ccw"]) })).output(z.void()),
		highlight: oc.input(z.object({ ids: z.array(PhotoId).min(1), value: z.boolean() })).output(z.void()),
		/** rating 0 removes the viewer's rating. */
		rate: oc.input(z.object({ id: PhotoId, rating: z.number().int().min(0).max(5) })).output(z.void()),
		albumsOf: oc
			.input(z.object({ id: PhotoId }))
			.output(z.array(z.object({ id: AlbumId, title: z.string() }))),
	},

	tags: {
		list: oc.output(z.array(TagInfo)),
		rename: oc.input(z.object({ id: z.number().int(), name: z.string().min(1).max(100) })).output(z.void()),
		merge: oc
			.input(z.object({ sourceIds: z.array(z.number().int()).min(1), targetId: z.number().int() }))
			.output(z.void()),
		delete: oc.input(z.object({ ids: z.array(z.number().int()).min(1) })).output(z.void()),
		attach: oc
			.input(z.object({ photoIds: z.array(PhotoId).min(1), names: z.array(z.string().min(1)).min(1) }))
			.output(z.void()),
		detach: oc
			.input(z.object({ photoIds: z.array(PhotoId).min(1), tagIds: z.array(z.number().int()).min(1) }))
			.output(z.void()),
	},

	search: {
		/**
		 * Term grammar: free words match title/description; modifiers `tag:x`, `type:image|video`, `date:YYYY[-MM[-DD]]`,
		 * `color:#rrggbb`, `make:`, `model:`, `license:`, `rating:>=n`. Capped (isTruncated).
		 */
		photos: oc
			.input(
				z.object({
					term: z.string().min(1),
					album: AlbumId.optional(),
					limit: z.number().int().max(2000).default(500),
				}),
			)
			.output(PhotoRatiosSoA),
		albums: oc.input(z.object({ term: z.string().min(1) })).output(z.array(AlbumTile)),
	},

	map: {
		/** Geotagged photos visible to the viewer, optionally within an album subtree and/or bounds. Capped. */
		points: oc
			.input(
				z.object({
					album: AnyAlbumId.optional(),
					bounds: z
						.object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() })
						.optional(),
					limit: z.number().int().max(20000).default(5000),
				}),
			)
			.output(
				z.object({
					ids: z.array(PhotoId),
					lats: z.array(z.number()),
					lngs: z.array(z.number()),
					/** Album context to use for the asset url of each point. */
					albumIds: z.array(AnyAlbumId),
					isTruncated: z.boolean(),
				}),
			),
	},

	users: {
		/** Share-target picker: local users plus (when configured) the Keycloak directory. */
		search: oc.input(z.object({ term: z.string().min(1).max(100) })).output(z.array(UserPublic)),
		/** Admin only. */
		list: oc.output(z.array(UserAdmin)),
	},

	settings: {
		list: oc.output(z.array(SettingRow)),
		update: oc
			.input(
				z.object({ entries: z.array(z.object({ key: z.string(), value: z.string().nullable() })).min(1) }),
			)
			.output(z.void()),
	},

	admin: {
		health: oc.output(Health),
		jobs: oc.input(z.object({ limit: z.number().int().max(500).default(100) })).output(z.array(JobRow)),
		/**
		 * Queue regeneration of size variants: the given photos and/or every photo in `albumId` and its child
		 * albums (recursive); all photos when neither is given.
		 */
		reprocess: oc
			.input(
				z.object({
					photoIds: z.array(PhotoId).optional(),
					albumId: AlbumId.optional(),
					variants: z.array(SizeVariantType).optional(),
				}),
			)
			.output(z.object({ queued: z.number().int() })),
		retryJob: oc.input(z.object({ id: z.number().int() })).output(z.void()),
	},
};

export type Contract = typeof contract;
