import type { PhotoDetail, SizeVariantType } from "@longan/shared";
import { assetUrl } from "@/api/assets.ts";

type Variant = { type: SizeVariantType; width: number; height: number; filesize: number };

/**
 * Cache-busting revisions for photos rotated in this session: rotation rewrites the variant files in place
 * (same URLs, `Cache-Control: max-age=3600`), so the lightbox appends `?r=<n>` after a rotate.
 */
const revisions = new Map<string, number>();
export function bumpPhotoRevision(photoId: string): void {
	revisions.set(photoId, (revisions.get(photoId) ?? 0) + 1);
}

export function photoAssetUrl(albumCtx: string, photoId: string, variant: SizeVariantType): string {
	const url = assetUrl(albumCtx, photoId, variant);
	const rev = revisions.get(photoId);
	return rev ? `${url}?r=${rev}` : url;
}

export type ImageSources = {
	src: string;
	/** Width-descriptor srcset (empty when only one candidate). */
	srcset: string;
	/** Largest variant the viewer may load for deep zoom (original when allowed), or null. */
	zoom: { url: string; width: number } | null;
	/** Width of the rendition picked by default (for the hi-res swap decision). */
	width: number;
};

const DISPLAY_ORDER: SizeVariantType[] = ["medium", "medium2x"];
const FALLBACK_ORDER: SizeVariantType[] = ["small2x", "small", "thumb2x", "thumb"];

/**
 * Sources for the lightbox <img>. Only variants listed in `details.sizeVariants` are used (the server lists
 * exactly what exists and what the viewer may fetch, so `canAccessFullPhoto` is honoured implicitly):
 * medium (+medium2x) as srcset; the original when no medium exists; otherwise the best thumb-class variant.
 * Without details yet, medium/medium2x are requested (the asset route falls back server-side).
 */
export function imageSources(albumCtx: string, photoId: string, detail?: PhotoDetail | null): ImageSources {
	const url = (v: SizeVariantType) => photoAssetUrl(albumCtx, photoId, v);
	if (!detail) {
		return { src: url("medium"), srcset: `${url("medium")} 1x, ${url("medium2x")} 2x`, zoom: null, width: 0 };
	}
	const byType = new Map<SizeVariantType, Variant>(detail.sizeVariants.map((v) => [v.type, v]));
	const original = byType.get("original");
	const zoomable =
		original && detail.type === "image" ? { url: url("original"), width: original.width } : null;
	const display = DISPLAY_ORDER.map((t) => byType.get(t)).filter((v): v is Variant => !!v);
	if (display.length > 0) {
		const base = display[0]!;
		return {
			src: url(base.type),
			srcset: display.length > 1 ? display.map((v) => `${url(v.type)} ${v.width}w`).join(", ") : "",
			zoom: zoomable,
			width: Math.max(...display.map((v) => v.width)),
		};
	}
	if (zoomable && original) {
		return { src: zoomable.url, srcset: "", zoom: zoomable, width: original.width };
	}
	const fallback = FALLBACK_ORDER.map((t) => byType.get(t)).filter((v): v is Variant => !!v);
	if (fallback.length > 0) {
		const best = fallback[0]!;
		return { src: url(best.type), srcset: "", zoom: null, width: best.width };
	}
	return { src: url("medium"), srcset: "", zoom: null, width: 0 };
}

/** Poster frame for videos: medium when allowed, else the best smaller rendition. */
export function videoPoster(albumCtx: string, photoId: string, detail?: PhotoDetail | null): string {
	return imageSources(albumCtx, photoId, detail ? { ...detail, type: "video" } : null).src;
}

/** The playable video source (the original) when the viewer may fetch it. */
export function videoSource(albumCtx: string, photoId: string, detail?: PhotoDetail | null): string | null {
	if (!detail) return null;
	return detail.sizeVariants.some((v) => v.type === "original")
		? photoAssetUrl(albumCtx, photoId, "original")
		: null;
}
