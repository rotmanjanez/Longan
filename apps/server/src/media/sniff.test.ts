import { describe, expect, it } from "vitest";
import { MediaError, sniffBuffer } from "./sniff.ts";

const bytes = (...parts: Array<number[] | string>) => {
	const out: number[] = [];
	for (const p of parts) {
		if (typeof p === "string") for (const ch of p) out.push(ch.charCodeAt(0));
		else out.push(...p);
	}
	while (out.length < 64) out.push(0);
	return new Uint8Array(out);
};
const ftyp = (major: string, ...compat: string[]) => {
	const size = 16 + compat.length * 4;
	return bytes([0, 0, 0, size], "ftyp", major, [0, 0, 0, 0], ...compat);
};

describe("sniffBuffer", () => {
	it.each([
		[bytes([0xff, 0xd8, 0xff, 0xe0]), "a.jpg", "jpeg", "image", "jpg"],
		[bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "a.png", "png", "image", "png"],
		[bytes("GIF89a"), "a.gif", "gif", "image", "gif"],
		[bytes("RIFF", [0, 0, 0, 0], "WEBP"), "a.webp", "webp", "image", "webp"],
		[bytes("RIFF", [0, 0, 0, 0], "AVI "), "a.avi", "avi", "video", "avi"],
		[bytes("II", [0x2a, 0]), "a.tiff", "tiff", "image", "tif"],
		[bytes("MM", [0, 0x2a]), "a.tif", "tiff", "image", "tif"],
		[ftyp("heic", "mif1", "heic"), "IMG_1.HEIC", "heic", "image", "heic"],
		[ftyp("mif1", "mif1", "heic"), "a.heif", "heic", "image", "heic"],
		[ftyp("avif", "mif1", "avif"), "a.avif", "avif", "image", "avif"],
		[ftyp("mif1", "avif", "mif1"), "a.avif", "avif", "image", "avif"],
		[ftyp("isom", "isom", "mp41"), "clip.mp4", "mp4", "video", "mp4"],
		[ftyp("mp42", "isom"), "clip.m4v", "m4v", "video", "m4v"],
		[ftyp("M4V ", "M4V "), "clip.mp4", "m4v", "video", "m4v"],
		[ftyp("qt  ", "qt  "), "clip.mov", "mov", "video", "mov"],
		[bytes([0, 0, 0, 8], "wide"), "old.mov", "mov", "video", "mov"],
		[bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], "webm"), "a.webm", "webm", "video", "webm"],
		[bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], "matroska"), "a.mkv", "mkv", "video", "mkv"],
	])("detects %#: %s -> %s", (head, name, format, kind, ext) => {
		const s = sniffBuffer(head, name);
		expect(s).toMatchObject({ format, kind, ext });
	});

	it("trusts magic bytes over a wrong extension", () => {
		expect(sniffBuffer(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "photo.jpg").format).toBe(
			"png",
		);
	});

	it.each([
		[bytes("%PDF-1.7"), "doc.pdf"],
		[bytes("hello world, this is text"), "notes.txt"],
		[bytes("II", [0x2a, 0]), "raw.nef"],
		[new Uint8Array([0xff, 0xd8]), "short.jpg"],
		[bytes("PK", [3, 4]), "archive.zip"],
	])("rejects unsupported input %#", (head, name) => {
		expect(() => sniffBuffer(head, name)).toThrow(MediaError);
		expect(() => sniffBuffer(head, name)).toThrow(/Unsupported file type/);
	});
});
