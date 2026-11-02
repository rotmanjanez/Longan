import { dirname } from "node:path";
import type { SizeVariantType } from "@longan/shared";
import sharp from "sharp";
import { log } from "../lib/log.ts";
import { settingBool, settingInt, settingStr } from "../settings/index.ts";
import { absPath, ensureDir, safeUnlink, tmpFile, variantPath } from "./storage.ts";
import { heifDecoder, run } from "./tools.ts";

export type GeneratedVariant = Exclude<SizeVariantType, "original">;
export const GENERATED_VARIANTS: readonly GeneratedVariant[] = [
	"medium2x",
	"medium",
	"small2x",
	"small",
	"thumb2x",
	"thumb",
];

export type ImageSettings = {
	mediumMax: number;
	smallMax: number;
	thumbSize: number;
	generate2x: boolean;
	format: "webp" | "jpeg" | "avif";
	quality: number;
	placeholder: boolean;
};

export async function readImageSettings(): Promise<ImageSettings> {
	const format = await settingStr("image.format", "webp");
	return {
		mediumMax: await settingInt("image.medium_max", 1920),
		smallMax: await settingInt("image.small_max", 720),
		thumbSize: await settingInt("image.thumb_size", 200),
		generate2x: await settingBool("image.generate_2x", true),
		format: format === "jpeg" || format === "avif" ? format : "webp",
		quality: Math.min(100, Math.max(1, await settingInt("image.quality", 85))),
		placeholder: await settingBool("image.placeholder", true),
	};
}

export type VariantPlan = { type: GeneratedVariant; fit: "inside" | "cover"; size: number };

/**
 * Which variants to generate for a source of the given display size (pure).
 * - small: always (longest edge <= small_max, never enlarged)
 * - medium: when the source is larger than small (longest edge <= medium_max)
 * - thumb: always (centre-cropped square, edge <= thumb_size)
 * - *2x: only with image.generate_2x and when the source has at least twice the 1x size
 */
export function planVariants(width: number, height: number, s: ImageSettings): VariantPlan[] {
	const longest = Math.max(width, height);
	const shortest = Math.min(width, height);
	const plan: VariantPlan[] = [];
	if (s.generate2x && longest >= 2 * s.mediumMax)
		plan.push({ type: "medium2x", fit: "inside", size: 2 * s.mediumMax });
	if (longest > s.smallMax) plan.push({ type: "medium", fit: "inside", size: s.mediumMax });
	if (s.generate2x && longest >= 2 * s.smallMax)
		plan.push({ type: "small2x", fit: "inside", size: 2 * s.smallMax });
	plan.push({ type: "small", fit: "inside", size: s.smallMax });
	if (s.generate2x && shortest >= 2 * s.thumbSize)
		plan.push({ type: "thumb2x", fit: "cover", size: 2 * s.thumbSize });
	plan.push({ type: "thumb", fit: "cover", size: Math.min(s.thumbSize, shortest) });
	return plan;
}

export type VariantRow = {
	type: SizeVariantType;
	path: string;
	width: number;
	height: number;
	filesize: number;
};

/** Display dimensions of an image file (EXIF orientation applied). */
export async function imageSize(path: string): Promise<{ width: number; height: number }> {
	const m = await sharp(path, { failOn: "none" }).metadata();
	const width = m.autoOrient?.width ?? m.width;
	const height = m.autoOrient?.height ?? m.height;
	if (!width || !height) throw new Error("could not read image dimensions");
	return { width, height };
}

export type WorkingCopy = { path: string; plan: VariantPlan[] };

/** Resize target for the working copy: the smallest size that still serves every planned variant. */
function workingResize(width: number, height: number, plan: VariantPlan[]) {
	const inside = Math.max(0, ...plan.filter((p) => p.fit === "inside").map((p) => p.size));
	const cover = Math.max(0, ...plan.filter((p) => p.fit === "cover").map((p) => p.size));
	const byInside = inside / Math.max(width, height);
	const byCover = cover / Math.min(width, height);
	if (Math.max(byInside, byCover) >= 1) return null;
	if (byInside >= byCover) return width >= height ? { width: inside } : { height: inside };
	return width <= height ? { width: cover } : { height: cover };
}

/**
 * Decode `source` once into an autorotated, downscaled libvips file (ICC profile kept) that every variant,
 * the colours and the placeholder are rendered from. The file is removed after `fn`.
 */
export async function withWorkingCopy<T>(
	source: string,
	settings: ImageSettings,
	fn: (work: WorkingCopy) => Promise<T>,
): Promise<T> {
	const { width, height } = await imageSize(source);
	const plan = planVariants(width, height, settings);
	const path = await tmpFile(".v");
	try {
		let img = sharp(source, { failOn: "none", animated: false }).autoOrient();
		const target = workingResize(width, height, plan);
		if (target) img = img.resize(target);
		await img.keepIccProfile().toFile(path);
		return await fn({ path, plan });
	} finally {
		await safeUnlink(path);
	}
}

/**
 * Generate size variants from a working copy into STORAGE_PATH/<variant>/<stem>.<format>.
 * Failures of single variants are logged and skipped. `only` restricts generation to the given types.
 */
export async function generateVariants(opts: {
	work: WorkingCopy;
	stem: string;
	settings: ImageSettings;
	only?: readonly SizeVariantType[];
	/** Called with the relative path of every written file (for cleanup on failure). */
	onWrite?: (rel: string) => void;
}): Promise<VariantRow[]> {
	const { work, stem, settings: s } = opts;
	const ext = s.format === "jpeg" ? "jpg" : s.format;
	const rows: VariantRow[] = [];
	for (const p of work.plan) {
		if (opts.only && !opts.only.includes(p.type)) continue;
		const rel = variantPath(p.type, stem, ext);
		const abs = absPath(rel);
		try {
			await ensureDir(dirname(abs));
			let img = sharp(work.path)
				.resize(p.size, p.size, {
					fit: p.fit,
					position: "centre",
					withoutEnlargement: true,
				})
				.keepIccProfile();
			img =
				s.format === "jpeg"
					? img.flatten({ background: "#ffffff" }).jpeg({ quality: s.quality, mozjpeg: true })
					: s.format === "avif"
						? // AVIF needs a lower quality number than WebP for similar fidelity; effort 4 keeps encoding bearable.
							img.avif({ quality: Math.max(1, s.quality - 25), effort: 4 })
						: img.webp({ quality: s.quality, effort: 2 });
			opts.onWrite?.(rel);
			const info = await img.toFile(abs);
			rows.push({ type: p.type, path: rel, width: info.width, height: info.height, filesize: info.size });
		} catch (err) {
			log.error("size variant failed", { type: p.type, source: work.path, err: String(err) });
		}
	}
	return rows;
}

/** 16 px WebP, base64 without data: prefix. Null on failure. */
export async function makePlaceholder(source: string): Promise<string | null> {
	try {
		const buf = await sharp(source, { failOn: "none", animated: false })
			.autoOrient()
			.resize(16, 16, { fit: "inside" })
			.webp({ quality: 40 })
			.toBuffer();
		return buf.toString("base64");
	} catch (err) {
		log.warn("placeholder failed", { source, err: String(err) });
		return null;
	}
}

/**
 * Convert a HEIC/HEIF file to an autorotated JPEG (q92) keeping EXIF and the ICC profile.
 * sharp's prebuilt libvips decodes AVIF-coded HEIF only; HEVC-coded files (iPhone photos) fall back to
 * libheif's `heif-dec`/`heif-convert` when installed (the Docker image ships it).
 */
export async function convertHeicToJpeg(source: string, dest: string) {
	await ensureDir(dirname(dest));
	try {
		await sharp(source, { failOn: "none" })
			.autoOrient()
			.keepExif()
			.keepIccProfile()
			.jpeg({ quality: 92 })
			.toFile(dest);
		return;
	} catch (err) {
		const bin = await heifDecoder();
		if (!bin) throw err;
		log.debug("sharp cannot decode this HEIF, using libheif", { bin, err: String(err) });
		// libheif applies the HEIF transforms and resets the EXIF orientation of the JPEG it writes.
		await run(bin, ["-q", "92", source, dest]);
	}
}
