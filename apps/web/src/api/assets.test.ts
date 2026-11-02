import { describe, expect, it } from "vitest";
import { assetUrl, srcsetFor, tileFamily, zipUrl } from "./assets.ts";

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
