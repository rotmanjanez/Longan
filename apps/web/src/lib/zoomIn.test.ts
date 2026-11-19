import { describe, expect, it } from "vitest";
import type { Rect } from "./panZoom.ts";
import { zoomInKeyframes } from "./zoomIn.ts";

/** Applies `translate(tx, ty) scale(s)` (origin top left of the stage) to a stage-local rect: viewport rect. */
function project(frame: Keyframe, stage: Rect, r: Rect): Rect {
	const m = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(String(frame.transform));
	if (!m) throw new Error(`unexpected transform ${String(frame.transform)}`);
	const [tx, ty, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
	return {
		left: stage.left + tx + s * r.left,
		top: stage.top + ty + s * r.top,
		width: s * r.width,
		height: s * r.height,
	};
}

/** The visible rect of `inset(t r b l round x)` in stage-local coordinates. */
function clipRect(frame: Keyframe, stage: Rect): Rect {
	const m = /inset\((-?[\d.e-]+)px (-?[\d.e-]+)px (-?[\d.e-]+)px (-?[\d.e-]+)px/.exec(String(frame.clipPath));
	if (!m) throw new Error(`unexpected clip ${String(frame.clipPath)}`);
	const [t, r, b, l] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
	return { left: l, top: t, width: stage.width - l - r, height: stage.height - t - b };
}

function expectRect(actual: Rect, expected: Rect) {
	expect(actual.left).toBeCloseTo(expected.left, 6);
	expect(actual.top).toBeCloseTo(expected.top, 6);
	expect(actual.width).toBeCloseTo(expected.width, 6);
	expect(actual.height).toBeCloseTo(expected.height, 6);
}

describe("zoomInKeyframes", () => {
	// Stage offset from the viewport (e.g. by a side panel), a 3:2 photo fitted into it.
	const stage: Rect = { left: 10, top: 20, width: 1200, height: 800 };
	const fit: Rect = { left: 0, top: 0, width: 1200, height: 800 };
	const landscapeFit = fit;
	const portraitFit: Rect = { left: 333, top: 0, width: 534, height: 800 };

	it("starts with the photo covering the tile, centred, and clipped to it", () => {
		const tile: Rect = { left: 400, top: 300, width: 200, height: 200 }; // square tile, landscape photo
		const [first] = zoomInKeyframes(tile, stage, landscapeFit)!;
		const photo = project(first!, stage, landscapeFit);
		// Covers: height matches the tile, width overflows equally on both sides.
		expect(photo.height).toBeCloseTo(200, 6);
		expect(photo.width).toBeCloseTo(300, 6);
		expect(photo.left + photo.width / 2).toBeCloseTo(tile.left + tile.width / 2, 6);
		expect(photo.top + photo.height / 2).toBeCloseTo(tile.top + tile.height / 2, 6);
		expectRect(project(first!, stage, clipRect(first!, stage)), tile);
	});

	it("covers a wide tile with a portrait photo by width", () => {
		const tile: Rect = { left: 50, top: 600, width: 300, height: 100 };
		const [first] = zoomInKeyframes(tile, stage, portraitFit)!;
		const photo = project(first!, stage, portraitFit);
		expect(photo.width).toBeCloseTo(300, 6);
		expect(photo.height).toBeGreaterThan(100);
		expectRect(project(first!, stage, clipRect(first!, stage)), tile);
	});

	it("ends with the photo in place and clipped to exactly its fitted rect", () => {
		const [, last] = zoomInKeyframes({ left: 0, top: 0, width: 100, height: 100 }, stage, fit)!;
		expect(last!.transform).toBe("translate(0px, 0px) scale(1)");
		expectRect(clipRect(last!, stage), fit);
	});

	it("gives up on empty rects", () => {
		expect(zoomInKeyframes({ left: 0, top: 0, width: 0, height: 100 }, stage, fit)).toBeNull();
		expect(
			zoomInKeyframes({ left: 0, top: 0, width: 100, height: 100 }, stage, { ...fit, width: 0 }),
		).toBeNull();
	});
});
