import { describe, expect, it } from "vitest";
import { clampPan, fitRect, IDENTITY, isZoomed, toggleZoomScale, zoomAround } from "./panZoom.ts";

describe("pan/zoom geometry", () => {
	const container = { width: 1000, height: 500 };

	it("fits without upscaling and centres", () => {
		expect(fitRect({ width: 4000, height: 1000 }, container)).toEqual({
			left: 0,
			top: 125,
			width: 1000,
			height: 250,
		});
		expect(fitRect({ width: 200, height: 100 }, container)).toEqual({
			left: 400,
			top: 200,
			width: 200,
			height: 100,
		});
	});

	it("zooms around a point and clamps the pan to the image edges", () => {
		const fit = fitRect({ width: 2000, height: 1000 }, container);
		const z = zoomAround(IDENTITY, { x: 500, y: 250 }, 2, 8);
		expect(z).toEqual({ scale: 2, x: -500, y: -250 });
		expect(isZoomed(z)).toBe(true);
		// Dragging far to the right stops at the left image edge.
		expect(clampPan({ ...z, x: 300 }, fit, container).x + 0).toBe(0);
		expect(clampPan({ ...z, x: -5000 }, fit, container).x).toBe(-1000);
		// Never below fit.
		expect(zoomAround(z, { x: 0, y: 0 }, 0.2, 8).scale).toBe(1);
	});

	it("toggles between fit and 1:1 (or 2x for small pictures)", () => {
		expect(toggleZoomScale(IDENTITY, 4000, 1000)).toBe(4);
		expect(toggleZoomScale(IDENTITY, 1000, 1000)).toBe(2);
		expect(toggleZoomScale({ scale: 3, x: 0, y: 0 }, 4000, 1000)).toBe(1);
	});
});
