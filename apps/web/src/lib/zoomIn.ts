import type { Rect } from "./panZoom.ts";

/** Corner radius of grid tiles (rounded-[2px]), kept on the image while it grows out of the tile. */
const TILE_RADIUS = 2;

/**
 * Keyframes that grow a photo out of its grid tile. They apply to a layer covering the stage, with transform
 * origin at its top left. `from` and `stage` are viewport rects; `fit` is where the photo ends up, in stage
 * coordinates. The first frame scales the photo to cover the tile, centred on it, and clips it to the tile with
 * its rounded corners, so it looks like the cropped thumbnail. The last frame is the photo in place, unclipped.
 */
export function zoomInKeyframes(from: Rect, stage: Rect, fit: Rect): Keyframe[] | null {
	if (fit.width <= 0 || fit.height <= 0 || from.width <= 0 || from.height <= 0) return null;
	const s = Math.max(from.width / fit.width, from.height / fit.height);
	const tx = from.left + (from.width - fit.width * s) / 2 - stage.left - s * fit.left;
	const ty = from.top + (from.height - fit.height * s) / 2 - stage.top - s * fit.top;
	// clip-path is in the layer's own coordinates, before the transform.
	const inset = (r: Rect, radius: number) =>
		`inset(${r.top}px ${stage.width - r.left - r.width}px ${stage.height - r.top - r.height}px ${r.left}px round ${radius}px)`;
	const tile: Rect = {
		left: (from.left - stage.left - tx) / s,
		top: (from.top - stage.top - ty) / s,
		width: from.width / s,
		height: from.height / s,
	};
	return [
		{ transform: `translate(${tx}px, ${ty}px) scale(${s})`, clipPath: inset(tile, TILE_RADIUS / s) },
		{ transform: "translate(0px, 0px) scale(1)", clipPath: inset(fit, 0) },
	];
}
