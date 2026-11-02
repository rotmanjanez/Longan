import sharp from "sharp";

type Box = { pixels: Uint8Array[]; range: number; channel: 0 | 1 | 2 };

function measure(pixels: Uint8Array[]): Box {
	const min = [255, 255, 255];
	const max = [0, 0, 0];
	for (const p of pixels) {
		for (let c = 0; c < 3; c++) {
			const v = p[c] ?? 0;
			if (v < min[c]!) min[c] = v;
			if (v > max[c]!) max[c] = v;
		}
	}
	const ranges = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
	const channel = (
		ranges[0]! >= ranges[1]! && ranges[0]! >= ranges[2]! ? 0 : ranges[1]! >= ranges[2]! ? 1 : 2
	) as 0 | 1 | 2;
	return { pixels, range: ranges[channel]!, channel };
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/**
 * Dominant colours by median cut over packed RGB triples (length divisible by 3).
 * Repeatedly splits the box with the largest score (channel range x pixel count) at the median of its
 * widest channel; returns each box's mean colour as #rrggbb, most populous first, without duplicates.
 */
export function dominantColours(rgb: Uint8Array, count = 5): string[] {
	const n = Math.floor(rgb.length / 3);
	if (n === 0 || count <= 0) return [];
	const pixels: Uint8Array[] = new Array(n);
	for (let i = 0; i < n; i++) pixels[i] = rgb.subarray(i * 3, i * 3 + 3);
	const boxes: Box[] = [measure(pixels)];
	while (boxes.length < count) {
		let best = -1;
		let bestScore = 0;
		for (let i = 0; i < boxes.length; i++) {
			const b = boxes[i]!;
			const score = b.range * b.pixels.length;
			if (b.pixels.length > 1 && b.range > 0 && score > bestScore) {
				best = i;
				bestScore = score;
			}
		}
		if (best < 0) break;
		const box = boxes[best]!;
		const c = box.channel;
		const sorted = [...box.pixels].sort((a, b) => a[c]! - b[c]!);
		let mid = sorted.length >> 1;
		// Keep equal values together so both halves are non-empty and distinct where possible.
		const pivot = sorted[mid]![c]!;
		while (mid > 0 && sorted[mid - 1]![c] === pivot) mid--;
		if (mid === 0) {
			mid = sorted.length >> 1;
			while (mid < sorted.length && sorted[mid]![c] === pivot) mid++;
		}
		if (mid === 0 || mid >= sorted.length) break;
		boxes.splice(best, 1, measure(sorted.slice(0, mid)), measure(sorted.slice(mid)));
	}
	const result = boxes
		.map((b) => {
			let r = 0;
			let g = 0;
			let bl = 0;
			for (const p of b.pixels) {
				r += p[0]!;
				g += p[1]!;
				bl += p[2]!;
			}
			const k = b.pixels.length;
			return { colour: `#${hex(r / k)}${hex(g / k)}${hex(bl / k)}`, size: k };
		})
		.sort((a, b) => b.size - a.size)
		.map((x) => x.colour);
	return [...new Set(result)];
}

/** 5 dominant colours of an image file (autorotated, alpha flattened onto white, 64 px raster). */
export async function extractColours(path: string, count = 5): Promise<string[]> {
	const { data } = await sharp(path, { failOn: "none" })
		.autoOrient()
		.resize(64, 64, { fit: "inside" })
		.flatten({ background: "#ffffff" })
		.removeAlpha()
		.toColourspace("srgb")
		.raw()
		.toBuffer({ resolveWithObject: true });
	return dominantColours(new Uint8Array(data.buffer, data.byteOffset, data.length), count);
}
