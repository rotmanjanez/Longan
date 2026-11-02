import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Plain-route error body: `{ error: { code, message } }`. */
export function jsonError(c: Context, status: ContentfulStatusCode, code: string, message: string) {
	return c.json({ error: { code, message } }, status);
}

/** Filename safe for archives and Content-Disposition (no separators/control chars, bounded length). */
export function safeName(name: string, fallback = "Untitled"): string {
	const cleaned = name
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
		.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, "_")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "")
		.slice(0, 120)
		.trim();
	return cleaned || fallback;
}

/** `attachment; filename="ascii"; filename*=UTF-8''...` */
export function contentDisposition(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const EXT_MIME: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	png: "image/png",
	gif: "image/gif",
	avif: "image/avif",
	tif: "image/tiff",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	m4v: "video/x-m4v",
	mkv: "video/x-matroska",
	avi: "video/x-msvideo",
};

export const extOf = (path: string) => /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
