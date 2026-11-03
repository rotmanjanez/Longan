import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type ClickModifiers = { mod: boolean; shift: boolean };

/** Ctrl on Windows/Linux, Cmd on macOS. */
export function modifiersOf(e: MouseEvent | KeyboardEvent): ClickModifiers {
	const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
	return { mod: isMac ? e.metaKey : e.ctrlKey, shift: e.shiftKey };
}

function addRange(target: Set<string>, ordered: readonly string[], a: number, b: number, add: boolean) {
	const lo = Math.min(a, b);
	const hi = Math.max(a, b);
	for (let i = lo; i <= hi; i++) {
		const id = ordered[i];
		if (id === undefined) continue;
		if (add) target.add(id);
		else target.delete(id);
	}
}

/**
 * Photo/album selection (UI state only), ported from Lychee's `useSelection`:
 * plain click = not a selection (caller opens the item), ctrl/cmd = toggle, shift = range from the last
 * clicked item (removes the range when the clicked item is already selected). Selecting photos clears the
 * album selection and vice versa.
 *
 * Touch: a long press starts a selection ("tap mode"); while it lasts a plain tap toggles, like a ctrl-click.
 * Tap mode ends when the selection becomes empty.
 */
export const useSelectionStore = defineStore("selection", () => {
	const photoIds = ref<string[]>([]);
	const albumIds = ref<string[]>([]);
	const photoAnchor = ref<string | null>(null);
	const albumAnchor = ref<string | null>(null);
	/** Started by a touch long press: plain taps toggle instead of opening. */
	const tapMode = ref(false);

	const photoSet = computed(() => new Set(photoIds.value));
	const albumSet = computed(() => new Set(albumIds.value));
	const hasSelection = computed(() => photoIds.value.length > 0 || albumIds.value.length > 0);
	const count = computed(() => photoIds.value.length + albumIds.value.length);

	function clickGeneric(
		ids: typeof photoIds,
		anchor: typeof photoAnchor,
		id: string,
		ordered: readonly string[],
		mods: ClickModifiers,
	): boolean {
		if (!mods.mod && !mods.shift) return false;
		const set = new Set(ids.value);
		if (mods.mod && !mods.shift) {
			if (set.has(id)) set.delete(id);
			else set.add(id);
		} else {
			const cur = ordered.indexOf(id);
			const last = anchor.value === null ? -1 : ordered.indexOf(anchor.value);
			if (set.size === 0 || last === -1 || cur === -1) {
				if (set.has(id)) set.delete(id);
				else set.add(id);
			} else {
				addRange(set, ordered, last, cur, !set.has(id));
			}
		}
		anchor.value = id;
		const listed = new Set(ordered);
		ids.value = ordered.filter((x) => set.has(x)).concat([...set].filter((x) => !listed.has(x)));
		return true;
	}

	/** In tap mode a plain tap on the kind being selected toggles it. */
	function effective(mods: ClickModifiers, ids: typeof photoIds): ClickModifiers {
		return !mods.mod && !mods.shift && tapMode.value && ids.value.length > 0
			? { mod: true, shift: false }
			: mods;
	}

	function endTapModeIfEmpty() {
		if (photoIds.value.length === 0 && albumIds.value.length === 0) tapMode.value = false;
	}

	/** Returns true when the click was consumed as a selection gesture. */
	function clickPhoto(id: string, ordered: readonly string[], mods: ClickModifiers): boolean {
		const m = effective(mods, photoIds);
		if (!m.mod && !m.shift) return false;
		albumIds.value = [];
		const done = clickGeneric(photoIds, photoAnchor, id, ordered, m);
		endTapModeIfEmpty();
		return done;
	}

	function clickAlbum(id: string, ordered: readonly string[], mods: ClickModifiers): boolean {
		const m = effective(mods, albumIds);
		if (!m.mod && !m.shift) return false;
		photoIds.value = [];
		const done = clickGeneric(albumIds, albumAnchor, id, ordered, m);
		endTapModeIfEmpty();
		return done;
	}

	/** Touch long press: enter tap mode and toggle the pressed item. */
	function longPressPhoto(id: string, ordered: readonly string[]) {
		tapMode.value = true;
		clickPhoto(id, ordered, { mod: true, shift: false });
	}

	function longPressAlbum(id: string, ordered: readonly string[]) {
		tapMode.value = true;
		clickAlbum(id, ordered, { mod: true, shift: false });
	}

	function setPhotos(ids: readonly string[]) {
		albumIds.value = [];
		photoIds.value = [...new Set(ids)];
	}

	function selectAll(photos: readonly string[], albums: readonly string[] = []) {
		photoIds.value = [...photos];
		albumIds.value = [...albums];
	}

	function clear() {
		photoIds.value = [];
		albumIds.value = [];
		photoAnchor.value = null;
		albumAnchor.value = null;
		tapMode.value = false;
	}

	/** Drops ids that are no longer listed (after a reload). */
	function prune(validPhotos: readonly string[], validAlbums: readonly string[]) {
		const p = new Set(validPhotos);
		const a = new Set(validAlbums);
		photoIds.value = photoIds.value.filter((id) => p.has(id));
		albumIds.value = albumIds.value.filter((id) => a.has(id));
		endTapModeIfEmpty();
	}

	return {
		photoIds,
		albumIds,
		photoSet,
		albumSet,
		hasSelection,
		count,
		clickPhoto,
		clickAlbum,
		longPressPhoto,
		longPressAlbum,
		tapMode,
		setPhotos,
		selectAll,
		clear,
		prune,
	};
});
