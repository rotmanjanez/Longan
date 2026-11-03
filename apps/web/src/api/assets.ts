import type { ImageSizesConfig, SizeVariantType } from "@longan/shared";

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

/** Aspect ratio (width / height) of a variant family: thumbs are centre-cropped squares, the rest keep the photo's. */
export function familyRatio(family: VariantFamily, photoRatio: number): number {
	return family === "thumb" || !(photoRatio > 0) ? 1 : photoRatio;
}

/**
 * Width-descriptor srcset for a grid tile, e.g. `.../small 480w, .../small2x 960w`, so the browser picks by the
 * tile's rendered size (paired with `sizes`) instead of only by screen density. Widths are the nominal ones from
 * the `image.*` settings: a source smaller than that has a smaller rendition (and no 2x, which the server
 * answers with the 1x file), so overstating its width only ever makes the browser settle for what exists.
 */
export function tileSrcset(
	albumCtx: string,
	photoId: string,
	family: Exclude<VariantFamily, "medium">,
	photoRatio: number,
	sizes: ImageSizesConfig,
	version?: AssetVersion,
): string {
	const url = (v: SizeVariantType) => assetUrl(albumCtx, photoId, v, false, version);
	const r = familyRatio(family, photoRatio);
	const longest = family === "thumb" ? sizes.thumbSize : sizes.smallMax;
	const w = Math.max(1, Math.round(r >= 1 ? longest : longest * r));
	return `${url(family)} ${w}w, ${url(`${family}2x`)} ${2 * w}w`;
}

/**
 * CSS width an image of aspect `ratio` occupies in a box: covering it needs the wider of the box width and
 * the height-matched width; containing uses the narrower. Used as the tile `sizes`.
 */
export function renderedWidth(
	box: { width: number; height: number },
	ratio: number,
	fit: "cover" | "contain",
): number {
	const byHeight = box.height * ratio;
	return Math.max(
		1,
		Math.round(fit === "cover" ? Math.max(box.width, byHeight) : Math.min(box.width, byHeight)),
	);
}

/** Tile image family for a layout: square tiles use the centre-cropped thumbs, others the ratio-preserving smalls. */
export function tileFamily(layout: string): "thumb" | "small" {
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
