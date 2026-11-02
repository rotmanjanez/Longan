/** Smart album ids (kept local so the web bundle does not pull zod schemas from @longan/shared at runtime). */
export const SMART_ALBUM_IDS = [
	"unsorted",
	"recent",
	"highlighted",
	"untagged",
	"on_this_day",
	"timeline",
] as const;

export function isSmartAlbumId(id: string): boolean {
	return (SMART_ALBUM_IDS as readonly string[]).includes(id);
}

/** Lucide icon per smart album. */
export const SMART_ALBUM_ICONS: Record<string, string> = {
	unsorted: "lucide:inbox",
	recent: "lucide:clock",
	highlighted: "lucide:star",
	untagged: "lucide:tag",
	on_this_day: "lucide:calendar-heart",
	timeline: "lucide:calendar-range",
};

/** Plain-text rendering helper: collapse >2 blank lines; markup is never interpreted. */
export function plainText(text: string | null | undefined): string {
	return (text ?? "")
		.replace(/\r\n?/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
