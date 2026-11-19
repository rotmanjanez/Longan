import { afterEach, describe, expect, it, vi } from "vitest";
import { setLightboxOrigin, takeLightboxOrigin, tileThumbnail } from "./lightboxOrigin.ts";

const rect = { left: 1, top: 2, width: 3, height: 4 };

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = "";
});

describe("lightbox origin", () => {
	it("hands the tile rect to the lightbox of that photo, once", () => {
		setLightboxOrigin("a", rect);
		expect(takeLightboxOrigin("a")).toEqual(rect);
		expect(takeLightboxOrigin("a")).toBeNull();
	});

	it("is dropped for another photo or when stale", () => {
		setLightboxOrigin("a", rect);
		expect(takeLightboxOrigin("b")).toBeNull();
		expect(takeLightboxOrigin("a")).toBeNull();

		vi.useFakeTimers();
		setLightboxOrigin("a", rect);
		vi.advanceTimersByTime(2000);
		expect(takeLightboxOrigin("a")).toBeNull();
	});
});

describe("tileThumbnail", () => {
	function tile(id: string, opts: { loaded: boolean; crop?: boolean }) {
		document.body.insertAdjacentHTML(
			"beforeend",
			`<a data-photo-tile data-photo-id="${id}"><img src="/api/asset/x/${id}/small"${opts.crop ? " data-crop" : ""}></a>`,
		);
		const img = document.querySelector<HTMLImageElement>(`[data-photo-id="${id}"] img`)!;
		Object.defineProperty(img, "complete", { value: opts.loaded });
		Object.defineProperty(img, "naturalWidth", { value: opts.loaded ? 480 : 0 });
	}

	it("returns the loaded tile image", () => {
		tile("a", { loaded: true });
		expect(tileThumbnail("a")).toContain("/api/asset/x/a/small");
	});

	it("skips tiles that have not loaded, square crops and photos without a tile", () => {
		tile("a", { loaded: false });
		tile("b", { loaded: true, crop: true });
		expect(tileThumbnail("a")).toBeNull();
		expect(tileThumbnail("b")).toBeNull();
		expect(tileThumbnail("c")).toBeNull();
	});
});
