import type { PhotoRatiosSoA } from "@longan/shared";

/**
 * Props contract of the lightbox mounted by the gallery views (LightboxMount.vue).
 * Events: `close` (views navigate back to the listing), `navigate(photoId)` (views push the photo route).
 */
export type LightboxProps = {
	/** Album context for asset urls and `photos.details` (album id, smart id or "timeline"). */
	albumCtx: string;
	photoId: string;
	/** Ordered ids of the listing (prev/next). */
	ids: readonly string[];
	/** The listing columns (titles, types, colours...), index-aligned with `ids`. */
	listing?: PhotoRatiosSoA | null;
	/** Album the photo is shown in (real album id), null for smart/timeline/search contexts. */
	albumId?: string | null;
};
