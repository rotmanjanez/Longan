import type { LayoutConfig, PhotoLayout } from "@longan/shared";
import {
	gridLayout,
	justifiedLayout,
	type LayoutBox,
	masonryLayout,
	squareLayout,
} from "@longan/shared/layout";

/** Height of the date header row that opens every bucket. */
export const HEADER_ROW_HEIGHT = 40;

/** A contiguous run of photos (index range into the SoA arrays) that shares one header. */
export type BucketRange = { bucketId: string; label: string; start: number; count: number };

/**
 * Groups the per-photo bucket ids into contiguous ranges, labelled from `photos.buckets`.
 * Falls back to a single unlabelled range when headers are off, when there is a single bucket, or when the
 * listing is not ordered by bucket (e.g. sorted by title: a bucket would appear in several places).
 */
export function bucketRanges(
	bucketIds: readonly string[],
	buckets: { ids: readonly string[]; labels: readonly string[] } | null | undefined,
	headers: boolean,
): BucketRange[] {
	const n = bucketIds.length;
	if (n === 0) return [];
	const whole: BucketRange[] = [{ bucketId: "", label: "", start: 0, count: n }];
	if (!headers) return whole;
	const ranges: BucketRange[] = [];
	const seen = new Set<string>();
	const labels = new Map<string, string>();
	if (buckets) {
		for (let i = 0; i < buckets.ids.length; i++) {
			const id = buckets.ids[i] as string;
			labels.set(id, buckets.labels[i] ?? id);
		}
	}
	for (let i = 0; i < n; i++) {
		const id = bucketIds[i] ?? "";
		const last = ranges[ranges.length - 1];
		if (last && last.bucketId === id) {
			last.count++;
			continue;
		}
		if (seen.has(id)) return whole;
		seen.add(id);
		ranges.push({ bucketId: id, label: labels.get(id) ?? id, start: i, count: 1 });
	}
	// One bucket only (e.g. everything from the same month): a lone date title above the photos says nothing.
	return ranges.length > 1 ? ranges : whole;
}

export type GridParams = { mode: PhotoLayout; target: number; gap: number };

/**
 * Layout target per mode, adapted for narrow screens so phones get 2-3 tiles per row instead of one
 * full-width column of 200 px cells.
 */
export function gridParams(mode: PhotoLayout, width: number, cfg: LayoutConfig): GridParams {
	const gap = cfg.gap;
	const narrow = width > 0 && width < 640;
	switch (mode) {
		case "justified":
			return {
				mode,
				gap,
				target: narrow ? Math.min(cfg.justifiedRowHeight, Math.round(width / 2.5)) : cfg.justifiedRowHeight,
			};
		case "masonry":
			return {
				mode,
				gap,
				target: narrow
					? Math.min(cfg.masonryColumnWidth, Math.floor((width - gap) / 2))
					: cfg.masonryColumnWidth,
			};
		case "grid":
			return {
				mode,
				gap,
				target: narrow
					? Math.min(cfg.gridColumnWidth, Math.floor((width - 2 * gap) / 3))
					: cfg.gridColumnWidth,
			};
		default:
			return {
				mode,
				gap,
				target: narrow
					? Math.min(cfg.squareColumnWidth, Math.floor((width - 2 * gap) / 3))
					: cfg.squareColumnWidth,
			};
	}
}

function layoutRun(p: GridParams, ratios: ArrayLike<number>, width: number) {
	switch (p.mode) {
		case "justified":
			return justifiedLayout(ratios, width, p.target, p.gap);
		case "masonry":
			return masonryLayout(ratios, width, p.target, p.gap);
		case "grid":
			return gridLayout(ratios.length, width, p.target, p.gap);
		default:
			return squareLayout(ratios.length, width, p.target, p.gap);
	}
}

export type HeaderTop = { top: number; label: string; bucketId: string };
export type GridLayout = { boxes: LayoutBox[]; headers: HeaderTop[]; totalHeight: number };

/** Absolute boxes for every photo, bucket by bucket, each bucket preceded by a header row when labelled. */
export function computeGridLayout(
	ratios: readonly number[],
	ranges: readonly BucketRange[],
	width: number,
	p: GridParams,
): GridLayout {
	const boxes: LayoutBox[] = new Array(ratios.length);
	const headers: HeaderTop[] = [];
	if (width <= 0) return { boxes: [], headers, totalHeight: 0 };
	let top = 0;
	for (const r of ranges) {
		if (r.label !== "") {
			headers.push({ top, label: r.label, bucketId: r.bucketId });
			top += HEADER_ROW_HEIGHT + p.gap;
		}
		const res = layoutRun(p, ratios.slice(r.start, r.start + r.count), width);
		for (let i = 0; i < res.boxes.length; i++) {
			const b = res.boxes[i] as LayoutBox;
			boxes[r.start + i] = { top: b.top + top, left: b.left, width: b.width, height: b.height };
		}
		top += res.containerHeight + p.gap;
	}
	return { boxes, headers, totalHeight: ranges.length ? Math.max(0, top - p.gap) : 0 };
}

/** Virtualizer row unit: one visual row (tiles sharing a `top`), the first one of a bucket carrying its header. */
export type GridChunk = {
	key: string;
	/** Absolute top in grid coordinates. */
	top: number;
	/** Stride to the next chunk (virtualizer size). */
	size: number;
	/** Lowest pixel any tile of this chunk reaches (masonry tiles overhang their stride). */
	bottom: number;
	start: number;
	count: number;
	header: { label: string; bucketId: string } | null;
};

/** Splits each bucket into rows by `top` transitions and turns them into virtualizer chunks. */
export function buildChunks(layout: GridLayout, ranges: readonly BucketRange[]): GridChunk[] {
	const { boxes, headers } = layout;
	const chunks: GridChunk[] = [];
	// No layout yet (width unknown) or a stale layout for a different listing: nothing to render.
	const total = ranges.reduce((n, r) => n + r.count, 0);
	if (boxes.length === 0 || boxes.length < total) return chunks;
	let h = 0;
	for (const r of ranges) {
		const header = r.label !== "" ? headers[h++] : undefined;
		let rowStart = r.start;
		let first = true;
		const end = r.start + r.count;
		for (let i = r.start + 1; i <= end; i++) {
			const prevTop = boxes[i - 1]?.top ?? 0;
			if (i < end && Math.abs((boxes[i]?.top ?? 0) - prevTop) <= 0.5) continue;
			let bottom = 0;
			for (let j = rowStart; j < i; j++) {
				const b = boxes[j];
				if (b) bottom = Math.max(bottom, b.top + b.height);
			}
			const rowTop = boxes[rowStart]?.top ?? 0;
			const top = first && header ? header.top : rowTop;
			chunks.push({
				key: `${r.bucketId}:${rowStart}`,
				top,
				size: bottom - top,
				bottom,
				start: rowStart,
				count: i - rowStart,
				header: first && header ? { label: header.label, bucketId: header.bucketId } : null,
			});
			first = false;
			rowStart = i;
		}
	}
	for (let i = 0; i < chunks.length - 1; i++) {
		const c = chunks[i] as GridChunk;
		c.size = Math.max(0, (chunks[i + 1] as GridChunk).top - c.top);
	}
	return chunks;
}

/**
 * For each chunk, the lowest chunk index whose tiles still reach into it. Row layouts map to themselves;
 * masonry tiles overhang later strides, so the virtualizer range must start earlier to keep them mounted.
 */
export function overhangStarts(chunks: readonly GridChunk[], lookback = 64): number[] {
	return chunks.map((c, i) => {
		let first = i;
		for (let k = i - 1; k >= Math.max(0, i - lookback); k--) {
			if ((chunks[k] as GridChunk).bottom > c.top) first = k;
		}
		return first;
	});
}

/** Indices of the boxes intersecting a rectangle (grid coordinates). */
export function boxesInRect(
	boxes: readonly LayoutBox[],
	rect: { left: number; top: number; right: number; bottom: number },
): number[] {
	const hits: number[] = [];
	for (let i = 0; i < boxes.length; i++) {
		const b = boxes[i];
		if (!b) continue;
		if (
			b.left < rect.right &&
			b.left + b.width > rect.left &&
			b.top < rect.bottom &&
			b.top + b.height > rect.top
		) {
			hits.push(i);
		}
	}
	return hits;
}
