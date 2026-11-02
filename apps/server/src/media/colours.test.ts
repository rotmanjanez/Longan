import { describe, expect, it } from "vitest";
import { dominantColours } from "./colours.ts";

function raster(parts: Array<[number, [number, number, number]]>): Uint8Array {
	const total = parts.reduce((n, [count]) => n + count, 0);
	const out = new Uint8Array(total * 3);
	let i = 0;
	for (const [count, [r, g, b]] of parts) {
		for (let k = 0; k < count; k++) {
			out[i++] = r;
			out[i++] = g;
			out[i++] = b;
		}
	}
	return out;
}

describe("dominantColours", () => {
	it("returns [] for an empty raster", () => {
		expect(dominantColours(new Uint8Array(0))).toEqual([]);
	});

	it("returns one colour for a flat image", () => {
		expect(dominantColours(raster([[100, [255, 0, 0]]]))).toEqual(["#ff0000"]);
	});

	it("finds distinct blocks ordered by population", () => {
		const colours = dominantColours(
			raster([
				[50, [0, 0, 255]],
				[200, [255, 0, 0]],
				[100, [0, 255, 0]],
				[25, [255, 255, 255]],
				[10, [0, 0, 0]],
			]),
		);
		expect(colours).toEqual(["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000"]);
	});

	it("caps the result at the requested count and formats #rrggbb", () => {
		const parts: Array<[number, [number, number, number]]> = [];
		for (let i = 0; i < 20; i++) parts.push([10 + i, [i * 12, 255 - i * 12, (i * 37) % 256]]);
		const colours = dominantColours(raster(parts), 5);
		expect(colours).toHaveLength(5);
		for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("averages similar shades into one box", () => {
		const colours = dominantColours(
			raster([
				[100, [250, 10, 10]],
				[100, [240, 20, 20]],
				[100, [10, 10, 250]],
			]),
			2,
		);
		expect(colours).toEqual(["#f50f0f", "#0a0afa"]);
	});
});
