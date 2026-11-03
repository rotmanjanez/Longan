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
/** Display title: smart albums ("highlighted", ...) are translated, everything else is the stored title. */
export function albumTitle(
	head: { id: string; kind: string; title: string },
	t: (key: string) => string,
	te: (key: string) => boolean,
): string {
	const key = `gallery.smart.${head.id}`;
	return head.kind === "smart" && te(key) ? t(key) : head.title;
}

export function plainText(text: string | null | undefined): string {
	return (text ?? "")
		.replace(/\r\n?/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * Whether a photo may be moved out of the given album context. Moving from a smart album (or Unsorted)
 * replaces every album membership of the photo, so the server only allows it for the owner or an admin;
 * a per-album move grant is not enough there. Mirrors `photos.move` in apps/server.
 */
export function canMovePhotoFrom(
	albumCtx: string,
	photo: { ownerId: number; rights: { canMove: boolean } },
	me: { id: number; isAdmin: boolean } | null,
): boolean {
	if (!isSmartAlbumId(albumCtx)) return photo.rights.canMove;
	return me !== null && (me.isAdmin || photo.ownerId === me.id);
}
