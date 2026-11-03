import { z } from "zod";
import {
	AlbumId,
	AlbumKind,
	AlbumSortCol,
	AnyAlbumId,
	ImageOverlayType,
	License,
	MediaType,
	PhotoId,
	PhotoLayout,
	PhotoSortCol,
	SizeVariantType,
	SortOrder,
	TagLogic,
	ThemeColor,
	ThemeNeutral,
} from "../enums.ts";

/** ISO-8601 timestamp string (UTC). */
export const Timestamp = z.string();

export const UserPublic = z.object({
	id: z.number().int(),
	username: z.string(),
	displayName: z.string(),
});
export type UserPublic = z.infer<typeof UserPublic>;

export const UserMe = UserPublic.extend({
	email: z.string().nullable(),
	isAdmin: z.boolean(),
	mayUpload: z.boolean(),
	groups: z.array(z.string()),
});
export type UserMe = z.infer<typeof UserMe>;

export const UserAdmin = UserMe.extend({
	sub: z.string(),
	roles: z.array(z.string()),
	createdAt: Timestamp,
	lastLoginAt: Timestamp.nullable(),
});
export type UserAdmin = z.infer<typeof UserAdmin>;

export const GlobalRights = z.object({
	isAdmin: z.boolean(),
	mayUpload: z.boolean(),
	/** Can create top-level albums (= mayUpload). */
	canCreateAlbums: z.boolean(),
	canUseSearch: z.boolean(),
	canUseMap: z.boolean(),
	canUseTimeline: z.boolean(),
});
export type GlobalRights = z.infer<typeof GlobalRights>;

export const AlbumRights = z.object({
	canEdit: z.boolean(),
	canDelete: z.boolean(),
	canMove: z.boolean(),
	canUpload: z.boolean(),
	canDownload: z.boolean(),
	canShare: z.boolean(),
	canAccessFullPhoto: z.boolean(),
});
export type AlbumRights = z.infer<typeof AlbumRights>;

export const PhotoRights = z.object({
	canEdit: z.boolean(),
	canDelete: z.boolean(),
	canMove: z.boolean(),
	canDownload: z.boolean(),
	canAccessFullPhoto: z.boolean(),
});
export type PhotoRights = z.infer<typeof PhotoRights>;

export const ThemePalette = z.object({
	primary: ThemeColor,
	neutral: ThemeNeutral,
	/** Optional per-token overrides, e.g. { "primary-500": "#0ea5e9" }. Emitted as --ui-color-<token>. */
	overrides: z.record(z.string(), z.string()),
});
export type ThemePalette = z.infer<typeof ThemePalette>;

export const LayoutConfig = z.object({
	justifiedRowHeight: z.number().int(),
	squareColumnWidth: z.number().int(),
	masonryColumnWidth: z.number().int(),
	gridColumnWidth: z.number().int(),
	gap: z.number().int(),
});
export type LayoutConfig = z.infer<typeof LayoutConfig>;

/** Nominal size-variant dimensions (`image.*` settings), for width descriptors in tile srcsets. */
export const ImageSizesConfig = z.object({
	/** Longest edge of `small` (`small2x` is twice that). */
	smallMax: z.number().int(),
	/** Edge of the square `thumb` (`thumb2x` is twice that). */
	thumbSize: z.number().int(),
});
export type ImageSizesConfig = z.infer<typeof ImageSizesConfig>;

/** Everything the UI needs at boot. Mirrors Lychee's Gallery::Init, trimmed. */
export const InitConfig = z.object({
	title: z.string(),
	version: z.string(),
	darkModeDefault: z.boolean(),
	theme: ThemePalette,
	defaultLayout: PhotoLayout,
	layout: LayoutConfig,
	imageSizes: ImageSizesConfig,
	imageOverlayType: ImageOverlayType,
	dateFormat: z.string(),
	loginRequired: z.boolean(),
	nsfwVisibleByDefault: z.boolean(),
	nsfwBlur: z.boolean(),
	downloadableVariants: z.array(SizeVariantType),
	mapTileUrl: z.string(),
	mapAttribution: z.string(),
	features: z.object({ map: z.boolean(), timeline: z.boolean(), search: z.boolean(), ratings: z.boolean() }),
	smartAlbums: z.array(z.string()),
	recentAgeDays: z.number().int(),
	uploadMaxBytes: z.number().int(),
	uploadParallelism: z.number().int(),
	/** Lightbox slideshow interval in seconds. */
	slideshowIntervalS: z.number().int(),
});
export type InitConfig = z.infer<typeof InitConfig>;

export const Sorting = z.object({ col: z.string(), order: SortOrder });

export const AlbumTile = z.object({
	id: AnyAlbumId,
	kind: AlbumKind,
	title: z.string(),
	/** Cover photo for the viewer (null when the album is empty for them). Thumb url is derived client-side. */
	coverId: PhotoId.nullable(),
	/** First dominant colour of the cover, as #rrggbb, for the tinted placeholder. */
	coverColour: z.string().nullable(),
	isNsfw: z.boolean(),
	isPublic: z.boolean(),
	isLinkRequired: z.boolean(),
	/** Password-protected and not unlocked by this viewer. */
	isLocked: z.boolean(),
	hasChildren: z.boolean(),
	numPhotos: z.number().int(),
	ownerId: z.number().int().nullable(),
	createdAt: Timestamp,
	minTakenAt: Timestamp.nullable(),
	maxTakenAt: Timestamp.nullable(),
});
export type AlbumTile = z.infer<typeof AlbumTile>;

export const AlbumHead = z.object({
	id: AnyAlbumId,
	kind: AlbumKind,
	title: z.string(),
	description: z.string().nullable(),
	ownerId: z.number().int().nullable(),
	ownerName: z.string().nullable(),
	parentId: AlbumId.nullable(),
	breadcrumbs: z.array(z.object({ id: AlbumId, title: z.string() })),
	coverId: PhotoId.nullable(),
	isNsfw: z.boolean(),
	license: License.nullable(),
	slug: z.string().nullable(),
	createdAt: Timestamp.nullable(),
	publishedAt: Timestamp.nullable(),
	numPhotos: z.number().int(),
	numChildren: z.number().int(),
	minTakenAt: Timestamp.nullable(),
	maxTakenAt: Timestamp.nullable(),
	photoSorting: z.object({ col: PhotoSortCol, order: SortOrder }).nullable(),
	albumSorting: z.object({ col: AlbumSortCol, order: SortOrder }).nullable(),
	photoLayout: PhotoLayout.nullable(),
	/** Protection as seen by someone who can edit; null for others. */
	protection: z
		.object({
			isPublic: z.boolean(),
			isLinkRequired: z.boolean(),
			hasPassword: z.boolean(),
			grantsFullPhotoAccess: z.boolean(),
			grantsDownload: z.boolean(),
			grantsUpload: z.boolean(),
		})
		.nullable(),
	/** Tag albums only. */
	tags: z.array(z.object({ id: z.number().int(), name: z.string() })),
	tagLogic: TagLogic.nullable(),
	rights: AlbumRights,
});
export type AlbumHead = z.infer<typeof AlbumHead>;

/** Column-oriented photo listing. All arrays are index-aligned. Tile URLs are derived client-side from ids. */
export const PhotoRatiosSoA = z.object({
	ids: z.array(PhotoId),
	/** width / height of the original. */
	ratios: z.array(z.number()),
	bucketIds: z.array(z.string()),
	titles: z.array(z.string()),
	types: z.array(MediaType),
	isHighlighteds: z.array(z.boolean()),
	ratingAvgs: z.array(z.number().nullable()),
	takenAts: z.array(Timestamp.nullable()),
	createdAts: z.array(Timestamp),
	/** First dominant colour (#rrggbb) or null; the tile is tinted with it until the thumb loads. */
	colours: z.array(z.string().nullable()),
	/** photos.updated_at as epoch seconds; appended as `?v=` to asset urls so rotate/reprocess bust caches. */
	updatedAts: z.array(z.number()),
	/** True when the listing was capped (search) and more rows exist. */
	isTruncated: z.boolean(),
});
export type PhotoRatiosSoA = z.infer<typeof PhotoRatiosSoA>;

export const PhotoBuckets = z.object({
	ids: z.array(z.string()),
	counts: z.array(z.number().int()),
	/** Pre-rendered label for the sticky header, e.g. "March 2024". */
	labels: z.array(z.string()),
});
export type PhotoBuckets = z.infer<typeof PhotoBuckets>;

export const SizeVariantInfo = z.object({
	type: SizeVariantType,
	width: z.number().int(),
	height: z.number().int(),
	filesize: z.number().int(),
});

export const PhotoDetail = z.object({
	id: PhotoId,
	title: z.string(),
	description: z.string().nullable(),
	type: MediaType,
	mime: z.string(),
	filesize: z.number().int(),
	width: z.number().int(),
	height: z.number().int(),
	checksum: z.string(),
	ownerId: z.number().int(),
	takenAt: Timestamp.nullable(),
	takenAtTz: z.string().nullable(),
	createdAt: Timestamp,
	updatedAt: Timestamp,
	make: z.string().nullable(),
	model: z.string().nullable(),
	lens: z.string().nullable(),
	iso: z.string().nullable(),
	aperture: z.string().nullable(),
	shutter: z.string().nullable(),
	focal: z.string().nullable(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	altitude: z.number().nullable(),
	license: License.nullable(),
	isHighlighted: z.boolean(),
	ratingAvg: z.number().nullable(),
	myRating: z.number().int().nullable(),
	duration: z.number().nullable(),
	fps: z.number().nullable(),
	tags: z.array(z.object({ id: z.number().int(), name: z.string() })),
	colours: z.array(z.string()),
	/** base64 webp data (no data: prefix) of the 16px placeholder, or null. */
	placeholder: z.string().nullable(),
	/** Variants that exist AND the viewer may fetch. */
	sizeVariants: z.array(SizeVariantInfo),
	albums: z.array(z.object({ id: AlbumId, title: z.string() })),
	rights: PhotoRights,
});
export type PhotoDetail = z.infer<typeof PhotoDetail>;

export const ShareGrants = z.object({
	grantsFullPhotoAccess: z.boolean(),
	grantsDownload: z.boolean(),
	grantsUpload: z.boolean(),
	grantsEdit: z.boolean(),
	grantsDelete: z.boolean(),
	grantsMove: z.boolean(),
});
export type ShareGrants = z.infer<typeof ShareGrants>;

export const ShareGrant = ShareGrants.extend({
	id: z.number().int(),
	albumId: AlbumId,
	user: UserPublic,
});
export type ShareGrant = z.infer<typeof ShareGrant>;

export const TagInfo = z.object({ id: z.number().int(), name: z.string(), count: z.number().int() });
export type TagInfo = z.infer<typeof TagInfo>;

export const SettingRow = z.object({
	key: z.string(),
	value: z.string().nullable(),
	/** Validation DSL: "bool" | "int" | "int:min:max" | "string" | "enum:a|b|c" | "json" | "color". */
	type: z.string(),
	category: z.string(),
	description: z.string(),
});
export type SettingRow = z.infer<typeof SettingRow>;

export const JobRow = z.object({
	id: z.number().int(),
	type: z.string(),
	status: z.enum(["pending", "running", "done", "failed"]),
	attempts: z.number().int(),
	runAt: Timestamp,
	lastError: z.string().nullable(),
	createdAt: Timestamp,
	updatedAt: Timestamp,
});
export type JobRow = z.infer<typeof JobRow>;

export const Health = z.object({
	version: z.string(),
	runtime: z.object({ name: z.string(), version: z.string() }),
	db: z.object({ ok: z.boolean(), version: z.string().nullable() }),
	storage: z.object({ path: z.string(), freeBytes: z.number(), usedBytes: z.number() }),
	vips: z.object({ version: z.string(), heif: z.boolean() }),
	ffmpeg: z.object({ available: z.boolean(), version: z.string().nullable() }),
	jobs: z.object({ pending: z.number().int(), failed: z.number().int() }),
	counts: z.object({ users: z.number().int(), albums: z.number().int(), photos: z.number().int() }),
});
export type Health = z.infer<typeof Health>;
