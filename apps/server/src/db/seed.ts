import { sql } from "drizzle-orm";
import type { Db } from "./index.ts";
import { settings } from "./schema.ts";

/**
 * Default settings. Keys are the contract between server features and the admin settings page.
 * type DSL: bool | int | int:min:max | string | enum:a|b|c | json | color
 */
export const DEFAULT_SETTINGS: Array<{
	key: string;
	value: string | null;
	type: string;
	category: string;
	description: string;
}> = [
	{ key: "site.title", value: "Longan", type: "string", category: "Gallery", description: "Site title" },
	{
		key: "site.login_required",
		value: "0",
		type: "bool",
		category: "Gallery",
		description: "Hide everything from anonymous visitors",
	},
	{
		key: "site.dark_mode_default",
		value: "1",
		type: "bool",
		category: "Gallery",
		description: "Default to dark mode",
	},
	{
		key: "site.date_format",
		value: "d MMM yyyy",
		type: "string",
		category: "Gallery",
		description: "Date format for photo dates",
	},
	{
		key: "gallery.slideshow_interval_s",
		value: "5",
		type: "int:1:60",
		category: "Gallery",
		description: "Slideshow interval in seconds",
	},
	{
		key: "theme.primary",
		value: "sky",
		type: "enum:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose",
		category: "Theme",
		description: "Primary colour",
	},
	{
		key: "theme.neutral",
		value: "slate",
		type: "enum:slate|gray|zinc|neutral|stone",
		category: "Theme",
		description: "Neutral colour",
	},
	{
		key: "theme.overrides",
		value: "{}",
		type: "json",
		category: "Theme",
		description: 'Per-shade overrides, e.g. {"primary-500":"#0ea5e9"}',
	},
	{
		key: "layout.default",
		value: "justified",
		type: "enum:square|justified|masonry|grid",
		category: "Layout",
		description: "Default photo layout",
	},
	{
		key: "layout.justified_row_height",
		value: "320",
		type: "int:100:1000",
		category: "Layout",
		description: "Target row height (px)",
	},
	{
		key: "layout.square_column_width",
		value: "200",
		type: "int:80:800",
		category: "Layout",
		description: "Square tile width (px)",
	},
	{
		key: "layout.masonry_column_width",
		value: "300",
		type: "int:80:800",
		category: "Layout",
		description: "Masonry column width (px)",
	},
	{
		key: "layout.grid_column_width",
		value: "300",
		type: "int:80:800",
		category: "Layout",
		description: "Grid column width (px)",
	},
	{
		key: "layout.gap",
		value: "8",
		type: "int:0:64",
		category: "Layout",
		description: "Gap between tiles (px)",
	},
	{
		key: "layout.image_overlay",
		value: "exif",
		type: "enum:none|desc|date|exif",
		category: "Layout",
		description: "Lightbox overlay type",
	},
	{
		key: "sorting.albums_col",
		value: "created_at",
		type: "enum:created_at|title|min_taken_at|max_taken_at",
		category: "Sorting",
		description: "Default album sort column",
	},
	{
		key: "sorting.albums_order",
		value: "desc",
		type: "enum:asc|desc",
		category: "Sorting",
		description: "Default album sort order",
	},
	{
		key: "sorting.photos_col",
		value: "taken_at",
		type: "enum:created_at|taken_at|title|is_highlighted|type|rating_avg",
		category: "Sorting",
		description: "Default photo sort column",
	},
	{
		key: "sorting.photos_order",
		value: "asc",
		type: "enum:asc|desc",
		category: "Sorting",
		description: "Default photo sort order",
	},
	{
		key: "albums.default_protection",
		value: "private",
		type: "enum:private|public|public_hidden|inherit",
		category: "Albums",
		description: "Protection of newly created albums",
	},
	{
		key: "albums.public_grants_full_photo",
		value: "1",
		type: "bool",
		category: "Albums",
		description: "Public albums expose the original by default",
	},
	{
		key: "albums.public_grants_download",
		value: "0",
		type: "bool",
		category: "Albums",
		description: "Public albums allow download by default",
	},
	{
		key: "albums.default_license",
		value: "none",
		type: "enum:none|reserved|CC0|CC-BY-4.0|CC-BY-SA-4.0|CC-BY-ND-4.0|CC-BY-NC-4.0|CC-BY-NC-SA-4.0|CC-BY-NC-ND-4.0",
		category: "Albums",
		description: "Default license",
	},
	{
		key: "nsfw.visible_by_default",
		value: "0",
		type: "bool",
		category: "Albums",
		description: "Show sensitive albums without a warning",
	},
	{
		key: "nsfw.blur",
		value: "1",
		type: "bool",
		category: "Albums",
		description: "Blur sensitive album covers",
	},
	{
		key: "smart.unsorted",
		value: "1",
		type: "bool",
		category: "Smart albums",
		description: "Enable Unsorted",
	},
	{ key: "smart.recent", value: "1", type: "bool", category: "Smart albums", description: "Enable Recent" },
	{
		key: "smart.highlighted",
		value: "1",
		type: "bool",
		category: "Smart albums",
		description: "Enable Highlighted",
	},
	{
		key: "smart.untagged",
		value: "0",
		type: "bool",
		category: "Smart albums",
		description: "Enable Untagged",
	},
	{
		key: "smart.on_this_day",
		value: "1",
		type: "bool",
		category: "Smart albums",
		description: "Enable On this day",
	},
	{
		key: "smart.recent_age_days",
		value: "30",
		type: "int:1:3650",
		category: "Smart albums",
		description: "Days a photo counts as recent",
	},
	{
		key: "smart.public",
		value: "0",
		type: "bool",
		category: "Smart albums",
		description: "Show smart albums to anonymous visitors",
	},
	{ key: "features.search", value: "1", type: "bool", category: "Features", description: "Enable search" },
	{ key: "features.map", value: "1", type: "bool", category: "Features", description: "Enable map" },
	{
		key: "features.timeline",
		value: "1",
		type: "bool",
		category: "Features",
		description: "Enable timeline",
	},
	{
		key: "features.ratings",
		value: "1",
		type: "bool",
		category: "Features",
		description: "Enable star ratings",
	},
	{
		key: "features.timeline_public",
		value: "0",
		type: "bool",
		category: "Features",
		description: "Timeline visible to anonymous visitors",
	},
	{
		key: "map.tile_url",
		value: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
		type: "string",
		category: "Map",
		description: "Tile URL template",
	},
	{
		key: "map.attribution",
		value: "&copy; OpenStreetMap contributors",
		type: "string",
		category: "Map",
		description: "Tile attribution",
	},
	{
		key: "image.medium_max",
		value: "1920",
		type: "int:400:8000",
		category: "Image processing",
		description: "Medium: longest edge (px)",
	},
	{
		key: "image.small_max",
		value: "720",
		type: "int:200:2000",
		category: "Image processing",
		description: "Small: longest edge (px)",
	},
	{
		key: "image.thumb_size",
		value: "200",
		type: "int:100:400",
		category: "Image processing",
		description: "Thumb: square size (px)",
	},
	{
		key: "image.generate_2x",
		value: "1",
		type: "bool",
		category: "Image processing",
		description: "Also generate 2x variants",
	},
	{
		key: "image.format",
		value: "webp",
		type: "enum:webp|jpeg|avif",
		category: "Image processing",
		description: "Format of generated variants (avif: ~20-30% smaller, much slower to encode)",
	},
	{
		key: "image.quality",
		value: "85",
		type: "int:30:100",
		category: "Image processing",
		description: "Encoding quality",
	},
	{
		key: "image.placeholder",
		value: "1",
		type: "bool",
		category: "Image processing",
		description: "Generate 16px blurred placeholders",
	},
	{
		key: "upload.skip_duplicates",
		value: "1",
		type: "bool",
		category: "Upload",
		description: "Skip files whose checksum already exists",
	},
	{
		key: "upload.parallelism",
		value: "3",
		type: "int:1:8",
		category: "Upload",
		description: "Parallel uploads in the browser",
	},
	{
		key: "upload.video_thumb_at",
		value: "middle",
		type: "enum:first|middle",
		category: "Upload",
		description: "Video frame used for thumbnails",
	},
	{
		key: "download.variants",
		value: "original,medium,small",
		type: "string",
		category: "Download",
		description: "Comma list of variants offered for download",
	},
];

export async function seedSettings(db: Db) {
	await db
		.insert(settings)
		.values(DEFAULT_SETTINGS.map((s, i) => ({ ...s, sort: i })))
		.onConflictDoUpdate({
			target: settings.key,
			set: {
				type: sql`excluded.type`,
				category: sql`excluded.category`,
				description: sql`excluded.description`,
				sort: sql`excluded.sort`,
			},
		});
}
