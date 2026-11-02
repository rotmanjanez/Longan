import type { SizeVariantType } from "@longan/shared";

/** Asset version: `photos.updated_at` as epoch seconds (listing `updatedAts[i]`) or null when unknown. */
export type AssetVersion = number | null | undefined;

/** Epoch-second version from an ISO timestamp (`PhotoDetail.updatedAt`). */
export function versionOf(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * URL of one size variant, resolved by the server through the given album context (album id, smart id).
 * `version` is appended as `?v=` so rotated/reprocessed photos bypass the browser cache (the server ignores it).
 */
export function assetUrl(
	albumCtx: string,
	photoId: string,
	variant: SizeVariantType,
	download = false,
	version?: AssetVersion,
): string {
	const base = `/api/asset/${encodeURIComponent(albumCtx)}/${encodeURIComponent(photoId)}/${variant}`;
	const params: string[] = [];
	if (version != null) params.push(`v=${version}`);
	if (download) params.push("download=1");
	return params.length ? `${base}?${params.join("&")}` : base;
}

/** Variant family used for display; the 2x sibling is offered as the high-density candidate. */
export type VariantFamily = "thumb" | "small" | "medium";

/**
 * Density srcset for a variant family, e.g. `.../thumb 1x, .../thumb2x 2x`. The server falls back to the
 * next smaller variant when a 2x rendition does not exist, so offering it is always safe.
 */
export function srcsetFor(
	albumCtx: string,
	photoId: string,
	family: VariantFamily,
	version?: AssetVersion,
): string {
	const url = (v: SizeVariantType) => assetUrl(albumCtx, photoId, v, false, version);
	return `${url(family)} 1x, ${url(`${family}2x`)} 2x`;
}

/** Tile image family for a layout: square tiles use the centre-cropped thumbs, others the ratio-preserving smalls. */
export function tileFamily(layout: string): VariantFamily {
	return layout === "square" ? "thumb" : "small";
}

/** Streamed ZIP download of albums and/or photos (`GET /api/zip`). */
export function zipUrl(opts: { albums?: string[]; photos?: string[]; variant?: SizeVariantType }): string {
	const params = new URLSearchParams();
	if (opts.albums?.length) params.set("albums", opts.albums.join(","));
	if (opts.photos?.length) params.set("photos", opts.photos.join(","));
	params.set("variant", opts.variant ?? "original");
	return `/api/zip?${params.toString().replaceAll("%2C", ",")}`;
}
