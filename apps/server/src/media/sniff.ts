import { open } from "node:fs/promises";
import { extname } from "node:path";

/** Thrown for input the pipeline refuses (unsupported or unreadable media). Message is user-facing. */
export class MediaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MediaError";
	}
}

export type MediaFormat =
	| "jpeg"
	| "png"
	| "gif"
	| "webp"
	| "avif"
	| "heic"
	| "tiff"
	| "mp4"
	| "mov"
	| "webm"
	| "m4v"
	| "mkv"
	| "avi";

export type Sniffed = {
	kind: "image" | "video";
	format: MediaFormat;
	mime: string;
	/** Canonical extension (without dot) used for the stored original. */
	ext: string;
};

const INFO: Record<MediaFormat, Sniffed> = {
	jpeg: { kind: "image", format: "jpeg", mime: "image/jpeg", ext: "jpg" },
	png: { kind: "image", format: "png", mime: "image/png", ext: "png" },
	gif: { kind: "image", format: "gif", mime: "image/gif", ext: "gif" },
	webp: { kind: "image", format: "webp", mime: "image/webp", ext: "webp" },
	avif: { kind: "image", format: "avif", mime: "image/avif", ext: "avif" },
	heic: { kind: "image", format: "heic", mime: "image/heic", ext: "heic" },
	tiff: { kind: "image", format: "tiff", mime: "image/tiff", ext: "tif" },
	mp4: { kind: "video", format: "mp4", mime: "video/mp4", ext: "mp4" },
	mov: { kind: "video", format: "mov", mime: "video/quicktime", ext: "mov" },
	webm: { kind: "video", format: "webm", mime: "video/webm", ext: "webm" },
	m4v: { kind: "video", format: "m4v", mime: "video/x-m4v", ext: "m4v" },
	mkv: { kind: "video", format: "mkv", mime: "video/x-matroska", ext: "mkv" },
	avi: { kind: "video", format: "avi", mime: "video/x-msvideo", ext: "avi" },
};

export const SUPPORTED_EXTENSIONS = [
	"jpg",
	"jpeg",
	"jpe",
	"png",
	"gif",
	"webp",
	"avif",
	"heic",
	"heif",
	"hif",
	"tif",
	"tiff",
	"mp4",
	"mov",
	"qt",
	"webm",
	"m4v",
	"mkv",
	"avi",
] as const;

const ascii = (b: Uint8Array, start: number, len: number) =>
	String.fromCharCode(...b.subarray(start, start + len));
const starts = (b: Uint8Array, bytes: number[], at = 0) => bytes.every((v, i) => b[at + i] === v);

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
const MOV_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip", "pnot"]);

function ftypBrands(b: Uint8Array): string[] {
	const size = ((b[0] ?? 0) << 24) | ((b[1] ?? 0) << 16) | ((b[2] ?? 0) << 8) | (b[3] ?? 0);
	const end = Math.min(b.length, size > 8 ? size : 32);
	const brands = [ascii(b, 8, 4)];
	for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(b, i, 4));
	return brands;
}

function sniffIsoBmff(b: Uint8Array, ext: string): MediaFormat | null {
	const [major, ...compatible] = ftypBrands(b);
	if (!major) return null;
	if (AVIF_BRANDS.has(major)) return "avif";
	if (major === "mif1" || major === "msf1") {
		// Generic HEIF brand: the compatible list tells AVIF from HEIC.
		if (compatible.some((c) => AVIF_BRANDS.has(c))) return "avif";
		return "heic";
	}
	if (HEIF_BRANDS.has(major)) return "heic";
	if (major === "qt  ") return "mov";
	if (major === "M4V " || major === "M4VH" || major === "M4VP") return "m4v";
	if (/^(iso\d|isom|mp4\d|mp41|mp42|avc1|dash|M4A |f4v |3gp\d|3g2\w|MSNV|NDAS|XAVC|mmp4|CAEP)/.test(major)) {
		if (ext === "m4v") return "m4v";
		if (ext === "mov" || ext === "qt") return "mov";
		return "mp4";
	}
	if (compatible.some((c) => AVIF_BRANDS.has(c))) return "avif";
	if (compatible.some((c) => HEIF_BRANDS.has(c))) return "heic";
	if (compatible.some((c) => c === "isom" || c === "mp41" || c === "mp42"))
		return ext === "m4v" ? "m4v" : "mp4";
	return null;
}

/**
 * Detect the media type from the first bytes (>= 64 recommended) and the filename. Magic bytes win over the
 * extension; the extension only disambiguates container brands (mp4 vs m4v vs mov).
 * Throws MediaError for anything unsupported.
 */
export function sniffBuffer(head: Uint8Array, filename: string): Sniffed {
	const ext = extname(filename).slice(1).toLowerCase();
	const fmt = detect(head, ext);
	if (!fmt) {
		const known = (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
		const what = known ? `content of this .${ext} file is not recognised` : ext ? `.${ext}` : "unknown type";
		throw new MediaError(
			`Unsupported file type (${what}). Supported: JPEG, PNG, GIF, WebP, AVIF, HEIC/HEIF, TIFF images and MP4, MOV, M4V, WebM, MKV, AVI videos.`,
		);
	}
	return INFO[fmt];
}

function detect(b: Uint8Array, ext: string): MediaFormat | null {
	if (b.length < 12) return null;
	if (starts(b, [0xff, 0xd8, 0xff])) return "jpeg";
	if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
	const sig6 = ascii(b, 0, 6);
	if (sig6 === "GIF87a" || sig6 === "GIF89a") return "gif";
	if (ascii(b, 0, 4) === "RIFF") {
		const kind = ascii(b, 8, 4);
		if (kind === "WEBP") return "webp";
		if (kind === "AVI ") return "avi";
		return null;
	}
	if (starts(b, [0x49, 0x49, 0x2a, 0x00]) || starts(b, [0x4d, 0x4d, 0x00, 0x2a])) {
		// TIFF-based RAW formats (NEF, CR2, ARW, DNG, ...) share this header; we only accept plain TIFF.
		if (ext && ext !== "tif" && ext !== "tiff") return null;
		return "tiff";
	}
	if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) {
		const head = ascii(b, 0, Math.min(b.length, 64));
		if (head.includes("webm")) return "webm";
		if (head.includes("matroska")) return "mkv";
		return ext === "webm" ? "webm" : "mkv";
	}
	const box = ascii(b, 4, 4);
	if (box === "ftyp") return sniffIsoBmff(b, ext);
	if (MOV_ATOMS.has(box) && (ext === "mov" || ext === "qt")) return "mov";
	return null;
}

/** Read the head of a file and sniff it. */
export async function sniffFile(path: string, filename: string): Promise<Sniffed> {
	const fh = await open(path, "r");
	try {
		const buf = new Uint8Array(256);
		const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
		return sniffBuffer(buf.subarray(0, bytesRead), filename);
	} finally {
		await fh.close();
	}
}
