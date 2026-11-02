import type { PhotoDetail } from "@longan/shared";
import { describe, expect, it, vi } from "vitest";
import { createDetailsLoader, DETAILS_BATCH } from "./detailsLoader.ts";

const detail = (id: string) => ({ id, title: id }) as unknown as PhotoDetail;

describe("details loader", () => {
	it("batches ids requested in the same tick into requests of at most 300", async () => {
		const fetcher = vi.fn(async (_ctx: string, ids: string[]) => ids.map(detail));
		const loader = createDetailsLoader(fetcher);
		const ids = Array.from({ length: 650 }, (_, i) => `p${i}`);
		const [a, b] = await Promise.all([
			loader.load("alb", ids.slice(0, 400)),
			loader.load("alb", ids.slice(300)),
		]);
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(fetcher.mock.calls.map((c) => c[1].length)).toEqual([DETAILS_BATCH, DETAILS_BATCH, 50]);
		expect(a.size).toBe(400);
		expect(b.size).toBe(350);
	});

	it("never re-requests loaded or in-flight ids", async () => {
		const fetcher = vi.fn(async (_ctx: string, ids: string[]) => ids.map(detail));
		const loader = createDetailsLoader(fetcher);
		const first = loader.load("alb", ["a", "b"]);
		await Promise.resolve();
		const second = loader.load("alb", ["b", "c"]); // b in flight
		await Promise.all([first, second]);
		await loader.load("alb", ["a", "c"]); // cached
		expect(fetcher.mock.calls.map((c) => c[1])).toEqual([["a", "b"], ["c"]]);
		expect(loader.get("alb", "c")?.id).toBe("c");
	});

	it("keeps album contexts apart and refetches after invalidation", async () => {
		const fetcher = vi.fn(async (_ctx: string, ids: string[]) => ids.map(detail));
		const loader = createDetailsLoader(fetcher);
		await Promise.all([loader.load("x", ["a"]), loader.load("y", ["a"])]);
		expect(fetcher).toHaveBeenCalledTimes(2);
		loader.invalidate(["a"]);
		await loader.load("x", ["a"]);
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it("lets failed ids be retried", async () => {
		let fail = true;
		const fetcher = vi.fn(async (_ctx: string, ids: string[]) => {
			if (fail) throw new Error("boom");
			return ids.map(detail);
		});
		const loader = createDetailsLoader(fetcher);
		const r = await loader.load("x", ["a"]);
		expect(r.size).toBe(0);
		fail = false;
		expect((await loader.load("x", ["a"])).size).toBe(1);
	});
});
