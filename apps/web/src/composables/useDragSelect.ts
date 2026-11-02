import type { LayoutBox } from "@longan/shared/layout";
import { onBeforeUnmount, type Ref, ref } from "vue";
import { boxesInRect } from "@/lib/photoGrid.ts";
import { modifiersOf, useSelectionStore } from "@/stores/selection.ts";

/** Elements that never start a rubber band (controls inside or around the grid). */
const INTERACTIVE =
	"button,input,textarea,select,summary,[role='button'],[role='menuitem'],[data-no-drag-select]";
/** A press on a tile only becomes a drag after this much movement, so a click stays a click. */
const THRESHOLD = 4;

export type DragRect = { left: number; top: number; width: number; height: number };

/**
 * Rubber-band selection over the absolutely positioned photo boxes (simplified port of Lychee's
 * `dragAndSelect.ts`). Hit-testing uses the analytic layout boxes, so it also covers tiles that are
 * virtualized away. Holding ctrl/cmd/shift when starting adds to the current selection.
 */
export function useDragSelect(opts: {
	container: Ref<HTMLElement | null>;
	boxes: () => readonly LayoutBox[];
	ids: () => readonly string[];
	enabled: () => boolean;
}) {
	const selection = useSelectionStore();
	const rect = ref<DragRect | null>(null);
	let origin: { x: number; y: number } | null = null;
	let base: string[] = [];
	let active = false;

	function point(e: MouseEvent) {
		const r = opts.container.value?.getBoundingClientRect();
		return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
	}

	function onMouseDown(e: MouseEvent) {
		if (e.button !== 0 || !opts.enabled() || !(e.target instanceof Element)) return;
		if (e.target.closest(INTERACTIVE)) return;
		origin = point(e);
		const m = modifiersOf(e);
		base = m.mod || m.shift ? [...selection.photoIds] : [];
		active = false;
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp, { once: true });
	}

	function onMove(e: MouseEvent) {
		if (!origin) return;
		const p = point(e);
		if (!active) {
			if (Math.abs(p.x - origin.x) < THRESHOLD && Math.abs(p.y - origin.y) < THRESHOLD) return;
			active = true;
			window.getSelection()?.removeAllRanges();
		}
		e.preventDefault();
		const left = Math.min(origin.x, p.x);
		const top = Math.min(origin.y, p.y);
		const right = Math.max(origin.x, p.x);
		const bottom = Math.max(origin.y, p.y);
		rect.value = { left, top, width: right - left, height: bottom - top };
		const ids = opts.ids();
		const hits = boxesInRect(opts.boxes(), { left, top, right, bottom }).map((i) => ids[i] as string);
		selection.setPhotos(base.concat(hits));
	}

	function swallowClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
	}

	function onUp() {
		window.removeEventListener("mousemove", onMove);
		if (active) {
			// The mouseup of a drag also produces a click on the tile under the pointer: eat it.
			window.addEventListener("click", swallowClick, { capture: true, once: true });
			setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }), 0);
		}
		origin = null;
		active = false;
		rect.value = null;
	}

	onBeforeUnmount(() => {
		window.removeEventListener("mousemove", onMove);
		window.removeEventListener("mouseup", onUp);
	});

	return { rect, onMouseDown };
}
