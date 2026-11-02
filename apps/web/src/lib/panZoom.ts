/**
 * Pan & zoom geometry for the lightbox, ported (simplified) from Lychee v8 `utils/panZoom.ts`.
 *
 * Coordinates are CSS pixels relative to the stage container. The zoom layer covers the container and is
 * transformed with `translate(x, y) scale(scale)` and `transform-origin: 0 0`, so a layer point `p` is drawn
 * at `p * scale + (x, y)`. At identity the image sits at its fitted rectangle.
 */
export type PanZoomState = { scale: number; x: number; y: number };
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = { left: number; top: number; width: number; height: number };

export const IDENTITY: PanZoomState = { scale: 1, x: 0, y: 0 };
/** Scale of a double-click when 1:1 would not enlarge the picture noticeably. */
export const CLICK_ZOOM = 2;
export const KEY_ZOOM_STEP = 1.5;
const FIT_EPSILON = 0.01;

export function isZoomed(s: PanZoomState): boolean {
	return s.scale > 1 + FIT_EPSILON;
}

/**
 * Rectangle of an image of `natural` size fitted (contain) into `container`, never upscaled beyond its
 * natural size, centred.
 */
export function fitRect(natural: Size, container: Size): Rect {
	if (natural.width <= 0 || natural.height <= 0 || container.width <= 0 || container.height <= 0) {
		return { left: 0, top: 0, width: container.width, height: container.height };
	}
	const k = Math.min(container.width / natural.width, container.height / natural.height, 1);
	const width = natural.width * k;
	const height = natural.height * k;
	return { left: (container.width - width) / 2, top: (container.height - height) / 2, width, height };
}

/** Zoom ceiling: four times native resolution, never below 4x fit. */
export function maxScale(naturalWidth: number, fitWidth: number): number {
	if (fitWidth <= 0) return 4;
	return Math.max(4, (4 * naturalWidth) / fitWidth);
}

export function clampScale(scale: number, max: number): number {
	return Math.min(Math.max(scale, 1), max);
}

/** Change the scale while keeping the layer point under `point` fixed on screen. */
export function zoomAround(s: PanZoomState, point: Point, scale: number, max: number): PanZoomState {
	const target = clampScale(scale, max);
	const ratio = target / s.scale;
	return { scale: target, x: point.x - (point.x - s.x) * ratio, y: point.y - (point.y - s.y) * ratio };
}

function axisRange(
	fitStart: number,
	fitLength: number,
	containerLength: number,
	scale: number,
): [number, number] {
	const length = fitLength * scale;
	if (length <= containerLength) {
		const centred = (containerLength - length) / 2 - fitStart * scale;
		return [centred, centred];
	}
	return [containerLength - (fitStart + fitLength) * scale, -fitStart * scale];
}

/** Keep the image inside the container: centred when smaller, edges may not move inside when larger. */
export function clampPan(s: PanZoomState, fit: Rect, container: Size): PanZoomState {
	const [minX, maxX] = axisRange(fit.left, fit.width, container.width, s.scale);
	const [minY, maxY] = axisRange(fit.top, fit.height, container.height, s.scale);
	return {
		scale: s.scale,
		x: Math.min(Math.max(s.x, minX), maxX),
		y: Math.min(Math.max(s.y, minY), maxY),
	};
}

/** Scale at which one image pixel is one CSS pixel (1:1), relative to the fitted size. */
export function oneToOneScale(naturalWidth: number, fitWidth: number): number {
	return fitWidth > 0 ? naturalWidth / fitWidth : 1;
}

/** Double-click target: 1:1 when that enlarges by at least 10%, else CLICK_ZOOM. */
export function toggleZoomScale(s: PanZoomState, naturalWidth: number, fitWidth: number): number {
	if (isZoomed(s)) return 1;
	const oneToOne = oneToOneScale(naturalWidth, fitWidth);
	return oneToOne >= 1.1 ? oneToOne : CLICK_ZOOM;
}

export function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Wheel delta in pixels whatever the delta mode (1 = lines, 2 = pages). */
export function wheelDelta(e: { deltaY: number; deltaMode: number }, containerHeight: number): number {
	if (e.deltaMode === 1) return e.deltaY * 16;
	if (e.deltaMode === 2) return e.deltaY * containerHeight;
	return e.deltaY;
}
