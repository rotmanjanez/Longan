import { z } from "zod";

/** 24-char URL-safe id (same shape as Lychee, keeps URL compatibility). */
export const ID_RE = /^[A-Za-z0-9_-]{24}$/;
export const AlbumId = z.string().regex(ID_RE, "invalid album id");
export const PhotoId = z.string().regex(ID_RE, "invalid photo id");
export type AlbumId = z.infer<typeof AlbumId>;
export type PhotoId = z.infer<typeof PhotoId>;

/** Virtual albums computed by query. They share the id space with real albums. */
export const SMART_ALBUM_IDS = [
	"unsorted",
	"recent",
	"highlighted",
	"untagged",
	"on_this_day",
	"timeline",
] as const;
export const SmartAlbumId = z.enum(SMART_ALBUM_IDS);
export type SmartAlbumId = z.infer<typeof SmartAlbumId>;
export const AnyAlbumId = z.union([SmartAlbumId, AlbumId]);
export type AnyAlbumId = z.infer<typeof AnyAlbumId>;
export const isSmartAlbumId = (id: string): id is SmartAlbumId =>
	(SMART_ALBUM_IDS as readonly string[]).includes(id);

export const AlbumKind = z.enum(["album", "tag", "smart"]);
export type AlbumKind = z.infer<typeof AlbumKind>;

/**
 * Generated renditions of a photo. `placeholder` is a 16px base64 webp stored on the photo row.
 * `original` is the uploaded file. Fallback chain for display: small2x -> small -> thumb; thumb2x -> thumb.
 */
export const SIZE_VARIANT_TYPES = [
	"original",
	"medium2x",
	"medium",
	"small2x",
	"small",
	"thumb2x",
	"thumb",
] as const;
export const SizeVariantType = z.enum(SIZE_VARIANT_TYPES);
export type SizeVariantType = z.infer<typeof SizeVariantType>;
/** Variants that are allowed to be served to viewers without the full-photo grant. */
export const THUMB_CLASS_VARIANTS: readonly SizeVariantType[] = ["small2x", "small", "thumb2x", "thumb"];

export const PhotoLayout = z.enum(["square", "justified", "masonry", "grid"]);
export type PhotoLayout = z.infer<typeof PhotoLayout>;

export const AlbumSortCol = z.enum(["created_at", "title", "min_taken_at", "max_taken_at"]);
export const PhotoSortCol = z.enum([
	"created_at",
	"taken_at",
	"title",
	"is_highlighted",
	"type",
	"rating_avg",
]);
export const SortOrder = z.enum(["asc", "desc"]);
export type AlbumSortCol = z.infer<typeof AlbumSortCol>;
export type PhotoSortCol = z.infer<typeof PhotoSortCol>;
export type SortOrder = z.infer<typeof SortOrder>;

export const License = z.enum([
	"none",
	"reserved",
	"CC0",
	"CC-BY-4.0",
	"CC-BY-SA-4.0",
	"CC-BY-ND-4.0",
	"CC-BY-NC-4.0",
	"CC-BY-NC-SA-4.0",
	"CC-BY-NC-ND-4.0",
]);
export type License = z.infer<typeof License>;

export const MediaType = z.enum(["image", "video"]);
export type MediaType = z.infer<typeof MediaType>;

export const TagLogic = z.enum(["or", "and"]);
export type TagLogic = z.infer<typeof TagLogic>;

/** Bucket granularity for date-grouped listings. */
export const BucketGranularity = z.enum(["year", "month", "day"]);
export type BucketGranularity = z.infer<typeof BucketGranularity>;

/** Default protection applied to newly created albums. */
export const DefaultProtection = z.enum(["private", "public", "public_hidden", "inherit"]);
export type DefaultProtection = z.infer<typeof DefaultProtection>;

export const ImageOverlayType = z.enum(["none", "desc", "date", "exif"]);
export type ImageOverlayType = z.infer<typeof ImageOverlayType>;

/** Nuxt UI colour names available for the theme palette. */
export const ThemeColor = z.enum([
	"red",
	"orange",
	"amber",
	"yellow",
	"lime",
	"green",
	"emerald",
	"teal",
	"cyan",
	"sky",
	"blue",
	"indigo",
	"violet",
	"purple",
	"fuchsia",
	"pink",
	"rose",
]);
export const ThemeNeutral = z.enum(["slate", "gray", "zinc", "neutral", "stone"]);
export type ThemeColor = z.infer<typeof ThemeColor>;
export type ThemeNeutral = z.infer<typeof ThemeNeutral>;
