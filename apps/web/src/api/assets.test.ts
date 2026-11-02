import { describe, expect, it } from "vitest";
import { assetUrl, srcsetFor, tileFamily, versionOf, zipUrl } from "./assets.ts";

const P = "AbCdEfGhIjKlMnOpQrStUvWx";

describe("asset helpers", () => {
	it("builds variant urls through the album context", () => {
		expect(assetUrl("album123", P, "thumb")).toBe(`/api/asset/album123/${P}/thumb`);
		expect(assetUrl("timeline", P, "original", true)).toBe(`/api/asset/timeline/${P}/original?download=1`);
	});

	it("encodes path segments", () => {
		expect(assetUrl("a/b", "x y", "small")).toBe("/api/asset/a%2Fb/x%20y/small");
	});

	it("offers the 2x sibling as density candidate", () => {
		expect(srcsetFor("recent", P, "small")).toBe(
			`/api/asset/recent/${P}/small 1x, /api/asset/recent/${P}/small2x 2x`,
		);
		expect(srcsetFor("recent", P, "thumb")).toContain("/thumb2x 2x");
		expect(srcsetFor("recent", P, "medium")).toContain("/medium2x 2x");
	});

	it("appends the asset version for cache busting", () => {
		expect(assetUrl("a", P, "thumb", false, 1700000000)).toBe(`/api/asset/a/${P}/thumb?v=1700000000`);
		expect(assetUrl("a", P, "original", true, 5)).toBe(`/api/asset/a/${P}/original?v=5&download=1`);
		expect(assetUrl("a", P, "thumb", false, null)).toBe(`/api/asset/a/${P}/thumb`);
		expect(srcsetFor("a", P, "small", 7)).toBe(
			`/api/asset/a/${P}/small?v=7 1x, /api/asset/a/${P}/small2x?v=7 2x`,
		);
		expect(versionOf("2024-08-02T10:00:00.900Z")).toBe(1722592800);
		expect(versionOf(null)).toBeNull();
	});

	it("picks square thumbs only for the square layout", () => {
		expect(tileFamily("square")).toBe("thumb");
		expect(tileFamily("justified")).toBe("small");
		expect(tileFamily("masonry")).toBe("small");
		expect(tileFamily("grid")).toBe("small");
	});

	it("builds zip download links", () => {
		expect(zipUrl({ photos: ["a", "b"] })).toBe("/api/zip?photos=a,b&variant=original");
		expect(zipUrl({ albums: ["x"], variant: "medium" })).toBe("/api/zip?albums=x&variant=medium");
	});
});
