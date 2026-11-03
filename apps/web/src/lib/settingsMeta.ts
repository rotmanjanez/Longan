import { ALBUM_SORT_COLS, licenseKey, PHOTO_SORT_COLS } from "./options.ts";

/**
 * Presentation of the admin settings page. The server owns keys, types and an English description; labels,
 * hints, category names and option labels are translated here (`settings.items.<key>`), falling back to the
 * server text for keys the client does not know yet.
 */

/** Rarely touched settings: shown under "More settings" (and always when filtering). */
export const ADVANCED_KEYS = new Set([
	"layout.justified_row_height",
	"layout.square_column_width",
	"layout.masonry_column_width",
	"layout.grid_column_width",
	"layout.gap",
	"site.date_format",
	"smart.recent_age_days",
]);
export const ADVANCED_CATEGORIES = new Set(["Map", "Image processing", "Upload"]);

/** Settings with no effect in this client (download only ever offers the original). */
export const HIDDEN_KEYS = new Set(["download.variants"]);

/** Column + direction settings edited as one "Date taken, newest first" select. */
export const SORT_PAIRS = [
	{
		col: "sorting.photos_col",
		order: "sorting.photos_order",
		prefix: "sorting.photo",
		cols: PHOTO_SORT_COLS,
	},
	{
		col: "sorting.albums_col",
		order: "sorting.albums_order",
		prefix: "sorting.album",
		cols: ALBUM_SORT_COLS,
	},
] as const;
export const SORT_ORDER_KEYS = new Set<string>(SORT_PAIRS.map((p) => p.order));

/** Stable id of a server category name, for i18n (`settings.groups.<id>`) and anchors. */
export const categoryId = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** vue-i18n reads dots as nesting; setting keys are nested the same way (`site.title` -> items.site.title). */
const itemKey = (key: string) => `settings.items.${key}`;

type T = (key: string) => string;
type Te = (key: string) => boolean;

export function settingLabel(t: T, te: Te, row: { key: string; description: string }): string {
	const k = `${itemKey(row.key)}.label`;
	return te(k) ? t(k) : row.description;
}
export function settingHint(t: T, te: Te, key: string): string | undefined {
	const k = `${itemKey(key)}.hint`;
	return te(k) ? t(k) : undefined;
}
export function categoryLabel(t: T, te: Te, category: string): string {
	const k = `settings.groups.${categoryId(category)}`;
	return te(k) ? t(k) : category;
}

/** Translated label of one enum value (shared vocabularies first, then the setting's own `options`). */
export function optionLabel(t: T, te: Te, key: string, value: string): string {
	if (key === "layout.default" && te(`gallery.layout.${value}`)) return t(`gallery.layout.${value}`);
	if (key === "albums.default_license" && te(licenseKey(value))) return t(licenseKey(value));
	const own = `${itemKey(key)}.options.${value}`;
	return te(own) ? t(own) : value;
}
