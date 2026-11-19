/**
 * Hand-off between the photo grid and the lightbox opened over it.
 *
 * - Origin: where the clicked tile sat on screen, so the lightbox can zoom the photo in from there. Opening goes
 *   through the router, hence a module-level slot instead of props.
 * - Tile thumbnail: the grid stays mounted under the lightbox, so a photo whose tile has loaded already has a
 *   rendition in the browser cache. The lightbox shows it at once while the full rendition loads.
 */
export type OriginRect = { left: number; top: number; width: number; height: number };

/** Timing of the zoom-in and of the backdrop and controls fading in with it. */
export const ZOOM_IN_TIMING: KeyframeAnimationOptions = {
	duration: 280,
	easing: "cubic-bezier(0.2, 0, 0, 1)",
};

export function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** An origin older than this is stale (the route change never happened, or was something else). */
const MAX_AGE_MS = 1500;

let pending: { photoId: string; rect: OriginRect; at: number } | null = null;

export function setLightboxOrigin(photoId: string, rect: OriginRect): void {
	pending = { photoId, rect, at: Date.now() };
}

/** The tile rect recorded for `photoId`, once: the slot is cleared whatever the outcome. */
export function takeLightboxOrigin(photoId: string): OriginRect | null {
	const o = pending;
	pending = null;
	if (!o || o.photoId !== photoId || Date.now() - o.at > MAX_AGE_MS) return null;
	return o.rect;
}

/**
 * URL of the loaded thumbnail of `photoId`'s grid tile, or null when no such tile is mounted, it has not
 * loaded, or it shows a square crop (stretched over the whole photo, a crop would show the wrong picture).
 */
export function tileThumbnail(photoId: string): string | null {
	if (typeof document === "undefined") return null;
	const img = document.querySelector<HTMLImageElement>(`[data-photo-tile][data-photo-id="${photoId}"] img`);
	if (!img || img.dataset.crop !== undefined || !img.complete || img.naturalWidth === 0) return null;
	return img.currentSrc || img.src || null;
}
