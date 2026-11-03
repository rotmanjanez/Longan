/** How each sort column reads in each direction ("Date taken, newest first" rather than a column + "Descending"). */
const ORDER_WORDS: Record<string, { asc: string; desc: string }> = {
	created_at: { asc: "oldest", desc: "newest" },
	taken_at: { asc: "oldest", desc: "newest" },
	min_taken_at: { asc: "oldest", desc: "newest" },
	max_taken_at: { asc: "oldest", desc: "newest" },
	title: { asc: "az", desc: "za" },
	type: { asc: "az", desc: "za" },
	rating_avg: { asc: "lowest", desc: "highest" },
};

export type SortOrder = "asc" | "desc";

/** `col:order` <-> parts, for selects that pick column and direction in one go. */
export const sortValue = (col: string, order: SortOrder) => `${col}:${order}`;
export function parseSortValue(v: string): { col: string; order: SortOrder } {
	const [col = "", order] = v.split(":");
	return { col, order: order === "asc" ? "asc" : "desc" };
}

/**
 * One select item per column and direction. `prefix` is the i18n namespace of the column names
 * (`sorting.photo` or `sorting.album`).
 */
export function sortOptions(
	t: (key: string) => string,
	prefix: "sorting.photo" | "sorting.album",
	cols: readonly string[],
): { label: string; value: string }[] {
	return cols.flatMap((col) =>
		(["desc", "asc"] as const).map((order) => ({
			label:
				col === "is_highlighted"
					? t(`sorting.highlighted_${order}`)
					: `${t(`${prefix}.${col}`)}, ${t(`sorting.order.${ORDER_WORDS[col]?.[order] ?? order}`)}`,
			value: sortValue(col, order),
		})),
	);
}
