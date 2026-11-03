/**
 * Enum values used by forms (kept local, like lib/albums.ts, so the bundle does not pull zod schemas from
 * @longan/shared at runtime). Must match packages/shared/src/enums.ts.
 */
export const LICENSES = [
	"none",
	"reserved",
	"CC0",
	"CC-BY-4.0",
	"CC-BY-SA-4.0",
	"CC-BY-ND-4.0",
	"CC-BY-NC-4.0",
	"CC-BY-NC-SA-4.0",
	"CC-BY-NC-ND-4.0",
] as const;
/** i18n key of a license label (vue-i18n treats dots as path separators, "CC-BY-4.0" -> "CC-BY-4_0"). */
export function licenseKey(license: string): string {
	return `licenses.${license.replace(/\./g, "_")}`;
}

export const PHOTO_SORT_COLS = [
	"created_at",
	"taken_at",
	"title",
	"is_highlighted",
	"type",
	"rating_avg",
] as const;
export const ALBUM_SORT_COLS = ["created_at", "title", "min_taken_at", "max_taken_at"] as const;
export const PHOTO_LAYOUTS = ["square", "justified", "masonry", "grid"] as const;
export const SIZE_VARIANTS = [
	"original",
	"medium2x",
	"medium",
	"small2x",
	"small",
	"thumb2x",
	"thumb",
] as const;
export const THEME_COLORS = [
	"alpine",
	"red",
	"orange",
	"amber",
	"yellow",
	"lime",
	"green",
	"emerald",
	"teal",
	"cyan",
	"sky",
	"blue",
	"indigo",
	"violet",
	"purple",
	"fuchsia",
	"pink",
	"rose",
] as const;
export const THEME_NEUTRALS = ["moss", "slate", "gray", "zinc", "neutral", "stone"] as const;

/** Sentinel for "use the default" in selects (reka-ui selects cannot hold null / ""). */
export const DEFAULT_OPTION = "__default";

/** Flat tree rows (from `albums.tree`) in depth-first title order, with depth for indentation. */
export function flattenTree(tree: { ids: string[]; titles: string[]; parentIds: (string | null)[] }) {
	const children = new Map<string | null, number[]>();
	tree.ids.forEach((_, i) => {
		const p = tree.parentIds[i] ?? null;
		const list = children.get(p) ?? [];
		list.push(i);
		children.set(p, list);
	});
	const byTitle = (a: number, b: number) => (tree.titles[a] ?? "").localeCompare(tree.titles[b] ?? "");
	const out: { id: string; title: string; depth: number; parentId: string | null }[] = [];
	const visit = (parent: string | null, depth: number) => {
		for (const i of (children.get(parent) ?? []).sort(byTitle)) {
			const id = tree.ids[i]!;
			out.push({ id, title: tree.titles[i] ?? "", depth, parentId: tree.parentIds[i] ?? null });
			visit(id, depth + 1);
		}
	};
	visit(null, 0);
	return out;
}

/** Ids of the given albums and all their descendants (to keep them out of move/merge targets). */
export function withDescendants(
	tree: { ids: string[]; parentIds: (string | null)[] },
	roots: readonly string[],
) {
	const out = new Set(roots);
	let grew = true;
	while (grew) {
		grew = false;
		tree.ids.forEach((id, i) => {
			const p = tree.parentIds[i];
			if (p && out.has(p) && !out.has(id)) {
				out.add(id);
				grew = true;
			}
		});
	}
	return out;
}
