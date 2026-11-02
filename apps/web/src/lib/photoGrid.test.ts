import { describe, expect, it } from "vitest";
import {
	bucketRanges,
	buildChunks,
	computeGridLayout,
	gridParams,
	HEADER_ROW_HEIGHT,
	overhangStarts,
} from "./photoGrid.ts";

const cfg = {
	justifiedRowHeight: 100,
	squareColumnWidth: 100,
	masonryColumnWidth: 100,
	gridColumnWidth: 100,
	gap: 10,
};
const buckets = { ids: ["2024-03", "2024-02"], labels: ["March 2024", "February 2024"] };

describe("bucketRanges", () => {
	it("groups contiguous bucket ids and labels them", () => {
		const r = bucketRanges(["2024-03", "2024-03", "2024-02"], buckets, true);
		expect(r).toEqual([
			{ bucketId: "2024-03", label: "March 2024", start: 0, count: 2 },
			{ bucketId: "2024-02", label: "February 2024", start: 2, count: 1 },
		]);
	});

	it("uses the id as label when the bucket listing lacks it", () => {
		expect(bucketRanges(["x", "y"], null, true).map((r) => r.label)).toEqual(["x", "y"]);
	});

	it("falls back to one headerless range when headers are off", () => {
		expect(bucketRanges(["a", "b"], buckets, false)).toEqual([
			{ bucketId: "", label: "", start: 0, count: 2 },
		]);
	});

	it("falls back to one range when the listing is not ordered by bucket", () => {
		const r = bucketRanges(["2024-03", "2024-02", "2024-03"], buckets, true);
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({ label: "", start: 0, count: 3 });
	});

	it("returns nothing for an empty listing", () => {
		expect(bucketRanges([], buckets, true)).toEqual([]);
	});
});

describe("computeGridLayout + buildChunks", () => {
	it("lays out each bucket below its header row", () => {
		const ranges = bucketRanges(["2024-03", "2024-03", "2024-03", "2024-02"], buckets, true);
		const p = gridParams("square", 340, cfg);
		const layout = computeGridLayout([1, 1, 1, 1], ranges, 340, p);
		// 3 columns of 106px ((340 - 2*10) / 3)
		expect(layout.headers).toEqual([
			{ top: 0, label: "March 2024", bucketId: "2024-03" },
			{ top: HEADER_ROW_HEIGHT + 10 + 106 + 10, label: "February 2024", bucketId: "2024-02" },
		]);
		expect(layout.boxes[0]).toEqual({ top: HEADER_ROW_HEIGHT + 10, left: 0, width: 106, height: 106 });
		expect(layout.boxes[2]).toMatchObject({ left: 232 });
		expect(layout.boxes[3]?.top).toBe(layout.headers[1]!.top + HEADER_ROW_HEIGHT + 10);
		expect(layout.totalHeight).toBe(layout.boxes[3]!.top + 106);
	});

	it("builds one chunk per visual row, the first of each bucket carrying the header", () => {
		const ids = ["a", "a", "a", "a", "b"];
		const ranges = bucketRanges(ids, { ids: ["a", "b"], labels: ["A", "B"] }, true);
		const p = gridParams("square", 340, cfg);
		const layout = computeGridLayout([1, 1, 1, 1, 1], ranges, 340, p);
		const chunks = buildChunks(layout, ranges);
		expect(chunks.map((c) => [c.start, c.count, c.header?.label ?? null])).toEqual([
			[0, 3, "A"],
			[3, 1, null],
			[4, 1, "B"],
		]);
		// Chunks tile the grid without gaps: size = stride to the next chunk.
		for (let i = 0; i < chunks.length - 1; i++) {
			expect(chunks[i]!.top + chunks[i]!.size).toBe(chunks[i + 1]!.top);
		}
		expect(chunks[0]!.top).toBe(0);
		const last = chunks[chunks.length - 1]!;
		expect(last.top + last.size).toBe(layout.totalHeight);
	});

	it("splits justified rows by their top", () => {
		const ranges = bucketRanges(["x", "x", "x", "x"], null, false);
		const p = gridParams("justified", 1000, cfg);
		const layout = computeGridLayout([2, 2, 2, 2], ranges, 1000, p);
		const chunks = buildChunks(layout, ranges);
		const rows = chunks.map((c) => c.count);
		expect(rows.reduce((a, b) => a + b, 0)).toBe(4);
		for (const c of chunks) {
			const tops = new Set(Array.from({ length: c.count }, (_, k) => layout.boxes[c.start + k]!.top));
			expect(tops.size).toBe(1);
		}
	});

	it("keeps overhanging masonry tiles mounted through overhangStarts", () => {
		const ranges = bucketRanges(["x", "x", "x"], null, false);
		const p = gridParams("masonry", 210, cfg);
		// Two columns: a very tall first tile, then short ones stacking in the other column.
		const layout = computeGridLayout([0.2, 2, 2], ranges, 210, p);
		const chunks = buildChunks(layout, ranges);
		const starts = overhangStarts(chunks);
		expect(chunks.length).toBeGreaterThan(1);
		// Every later chunk still lies inside the tall first tile, so the range must start at chunk 0.
		expect(starts.every((s) => s === 0)).toBe(true);
	});

	it("returns an empty layout (and no chunks) before the container has a width", () => {
		const ranges = bucketRanges(["x"], null, false);
		const layout = computeGridLayout([1], ranges, 0, gridParams("square", 0, cfg));
		expect(layout).toEqual({ boxes: [], headers: [], totalHeight: 0 });
		expect(buildChunks(layout, ranges)).toEqual([]);
	});
});

describe("gridParams", () => {
	it("shrinks the targets on phones so rows hold 2-3 tiles", () => {
		expect(gridParams("square", 375, cfg).target).toBe(100);
		expect(gridParams("square", 375, { ...cfg, squareColumnWidth: 200 }).target).toBe(
			Math.floor((375 - 20) / 3),
		);
		expect(gridParams("masonry", 375, { ...cfg, masonryColumnWidth: 300 }).target).toBe(
			Math.floor((375 - 10) / 2),
		);
		expect(gridParams("justified", 1280, cfg).target).toBe(100);
	});
});
