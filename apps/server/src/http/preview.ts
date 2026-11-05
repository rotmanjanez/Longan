import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isSmartAlbumId } from "@longan/shared";
import { sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { env } from "../env.ts";
import { log } from "../lib/log.ts";
import { albumAccessible, GUEST } from "../policy/index.ts";
import { albumMembers } from "../rpc/procedures/album-tiles.ts";
import { A } from "../rpc/procedures/gallery-common.ts";
import { defaultPhotoSort, dynamicPhotoOrder } from "../rpc/procedures/photo-scope.ts";
import { settingStr } from "../settings/index.ts";
import { extOf } from "./common.ts";

const GALLERY_PATH = /^\/gallery\/([A-Za-z0-9_-]{1,100})(?:\/([A-Za-z0-9_-]{24}))?\/?$/;
/** Messengers drop or shrink preview images above roughly this size (WhatsApp: ~300 KB). */
const MAX_IMAGE_BYTES = 300_000;
/** Formats messengers render in previews (no AVIF). */
const PREVIEW_MIME: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};
const MAX_DESCRIPTION = 200;

type Preview = {
	title: string;
	description: string | null;
	url: string;
	siteName: string;
	image: { url: string; type: string; width: number; height: number } | null;
};

type Row = {
	id: string;
	title: string;
	description: string | null;
	photo_id: string | null;
	variant: string | null;
	path: string | null;
	width: number | null;
	height: number | null;
};

/**
 * Link preview of a gallery deep link, as an anonymous visitor sees it: only albums open to everyone without
 * password or sign-in qualify. The image is the linked photo (if in the album) or the cover, a thumb-class variant
 * (served without the full-photo grant), and never from an NSFW album or a photo that is also in one.
 */
export async function galleryPreview(path: string): Promise<Preview | null> {
	const m = GALLERY_PATH.exec(path);
	if (!m || isSmartAlbumId(m[1]!)) return null;
	const key = m[1]!;
	const photoId = m[2];
	const def = await defaultPhotoSort();
	const order = dynamicPhotoOrder(
		sql`coalesce(a.photo_sort_col, ${def.col})`,
		sql`coalesce(a.photo_sort_order, ${def.order})`,
		"p",
	);
	const [row] = await db.execute<Row>(sql`
		with recursive nsfw as (
			select id from albums where is_nsfw
			union all
			select c.id from albums c join nsfw on c.parent_id = nsfw.id
		)
		select a.id, a.title, a.description, ph.id as photo_id, sv.type as variant, sv.path, sv.width, sv.height
		from albums a
		left join lateral (
			select p.id from photos p
			where a.id not in (select id from nsfw) and ${albumMembers(GUEST)}
				${photoId ? sql`and p.id = ${photoId}` : sql``}
				and not exists (select 1 from photo_album nx where nx.photo_id = p.id and nx.album_id in (select id from nsfw))
			order by (p.id is not distinct from a.cover_id) desc, ${order}
			limit 1
		) ph on true
		left join lateral (
			select sv.type, sv.path, sv.width, sv.height from size_variants sv
			where sv.photo_id = ph.id and (sv.type = 'small' or (sv.type = 'small2x' and sv.filesize <= ${MAX_IMAGE_BYTES}))
			order by sv.width desc
			limit 1
		) sv on true
		where a.id = (select id from albums where id = ${key} or slug = ${key} order by (id = ${key}) desc limit 1)
			and ${albumAccessible(GUEST, A)}
	`);
	if (!row) return null;
	const description = row.description?.trim().replace(/\s+/g, " ") || null;
	const chars = description ? Array.from(description) : [];
	const type = row.path ? PREVIEW_MIME[extOf(row.path)] : undefined;
	return {
		title: row.title,
		description:
			chars.length > MAX_DESCRIPTION ? `${chars.slice(0, MAX_DESCRIPTION - 1).join("")}…` : description,
		url: new URL(path, env.APP_URL).toString(),
		siteName: await settingStr("site.title", "Longan"),
		image: type
			? {
					url: new URL(`/api/asset/${row.id}/${row.photo_id}/${row.variant}`, env.APP_URL).toString(),
					type,
					width: row.width!,
					height: row.height!,
				}
			: null,
	};
}

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);

export function withPreview(html: string, p: Preview): string {
	const tags: [string, string | number][] = [
		["og:type", "website"],
		["og:site_name", p.siteName],
		["og:title", p.title],
		["og:url", p.url],
	];
	if (p.description) tags.push(["og:description", p.description]);
	if (p.image) {
		tags.push(
			["og:image", p.image.url],
			["og:image:type", p.image.type],
			["og:image:width", p.image.width],
			["og:image:height", p.image.height],
			["og:image:alt", p.title],
		);
	}
	const meta = tags.map(([k, v]) => `<meta property="${k}" content="${escapeHtml(String(v))}" />`);
	meta.push(`<meta name="twitter:card" content="${p.image ? "summary_large_image" : "summary"}" />`);
	if (p.description) meta.push(`<meta name="description" content="${escapeHtml(p.description)}" />`);
	const title = `<title>${escapeHtml(p.title)}</title>`;
	return html
		.replace(/<title>[^<]*<\/title>/, () => title)
		.replace("</head>", () => `${meta.join("")}</head>`);
}

/**
 * The SPA's index.html from `webDist`, rendered per path with link preview tags for publicly shared galleries.
 * Null when the build has no index.html (API-only image).
 */
export async function indexPage(webDist: string) {
	const indexHtml = await readFile(join(webDist, "index.html"), "utf8").catch(() => null);
	if (indexHtml === null) return null;
	return async (path: string): Promise<string> => {
		try {
			const preview = await galleryPreview(path);
			return preview ? withPreview(indexHtml, preview) : indexHtml;
		} catch (err) {
			log.warn("link preview failed", { path, err: String(err) });
			return indexHtml;
		}
	};
}
