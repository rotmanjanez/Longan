/**
 * Pure layout functions (port of @lychee-org/layouts). Given aspect ratios (w/h) and a container width
 * they return absolute boxes. No DOM. Used by the web virtual grid and in tests.
 */
export type LayoutBox = { top: number; left: number; width: number; height: number };
export type LayoutResult = { containerHeight: number; boxes: LayoutBox[] };

/** Flickr-style justified rows. `target` = desired row height. */
export function justifiedLayout(
	ratios: ArrayLike<number>,
	width: number,
	target: number,
	gap: number,
): LayoutResult {
	const boxes: LayoutBox[] = [];
	let top = 0;
	let row: number[] = [];
	let rowRatioSum = 0;
	const flush = (last: boolean) => {
		if (row.length === 0) return;
		const gaps = gap * (row.length - 1);
		let h = (width - gaps) / rowRatioSum;
		if (last && h > target) h = target;
		h = Math.round(h);
		let left = 0;
		for (const r of row) {
			const w = Math.round(r * h);
			boxes.push({ top, left, width: w, height: h });
			left += w + gap;
		}
		top += h + gap;
		row = [];
		rowRatioSum = 0;
	};
	for (let i = 0; i < ratios.length; i++) {
		const r = clampRatio(ratios[i] as number);
		row.push(r);
		rowRatioSum += r;
		const gaps = gap * (row.length - 1);
		if ((width - gaps) / rowRatioSum <= target) flush(false);
	}
	flush(true);
	return { containerHeight: Math.max(0, top - gap), boxes };
}

/** Fixed-width columns, items keep their ratio, shortest column first. */
export function masonryLayout(
	ratios: ArrayLike<number>,
	width: number,
	columnWidth: number,
	gap: number,
): LayoutResult {
	const cols = Math.max(1, Math.floor((width + gap) / (columnWidth + gap)));
	const colW = Math.floor((width - gap * (cols - 1)) / cols);
	const heights = new Array<number>(cols).fill(0);
	const boxes: LayoutBox[] = [];
	for (let i = 0; i < ratios.length; i++) {
		let c = 0;
		for (let j = 1; j < cols; j++) if ((heights[j] as number) < (heights[c] as number)) c = j;
		const h = Math.round(colW / clampRatio(ratios[i] as number));
		boxes.push({ top: heights[c] as number, left: c * (colW + gap), width: colW, height: h });
		heights[c] = (heights[c] as number) + h + gap;
	}
	return { containerHeight: Math.max(0, Math.max(...heights) - gap), boxes };
}

/** Uniform cells; the photo is object-fit inside. `columnWidth` is the target cell width. */
export function gridLayout(
	count: number,
	width: number,
	columnWidth: number,
	gap: number,
	cellRatio = 1,
): LayoutResult {
	const cols = Math.max(1, Math.floor((width + gap) / (columnWidth + gap)));
	const cellW = Math.floor((width - gap * (cols - 1)) / cols);
	const cellH = Math.round(cellW / cellRatio);
	const boxes: LayoutBox[] = [];
	for (let i = 0; i < count; i++) {
		const r = Math.floor(i / cols);
		const c = i % cols;
		boxes.push({ top: r * (cellH + gap), left: c * (cellW + gap), width: cellW, height: cellH });
	}
	const rows = Math.ceil(count / cols);
	return { containerHeight: Math.max(0, rows * (cellH + gap) - gap), boxes };
}

export const squareLayout = (count: number, width: number, columnWidth: number, gap: number) =>
	gridLayout(count, width, columnWidth, gap, 1);

function clampRatio(r: number): number {
	if (!Number.isFinite(r) || r <= 0) return 1;
	return Math.min(Math.max(r, 0.2), 5);
}
