import { onBeforeUnmount } from "vue";

/** Finger travel (px) that turns a press into a scroll and cancels the long press. */
const SLOP = 10;

/**
 * Touch/pen long press on an element (mouse presses are ignored: desktop selects with ctrl/shift/drag).
 * Bind `onPointerdown` and `onContextmenu`; call `consumeClick()` in the click handler to swallow the click
 * that some browsers still fire after a long press.
 */
export function useLongPress(onFire: () => void, ms = 450) {
	let timer = 0;
	let start: { x: number; y: number } | null = null;
	let firedAt = 0;
	let lastPointer = "";

	function cancel() {
		window.clearTimeout(timer);
		timer = 0;
		start = null;
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", cancel);
		window.removeEventListener("pointercancel", cancel);
	}

	function onMove(e: PointerEvent) {
		if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) cancel();
	}

	function onPointerdown(e: PointerEvent) {
		lastPointer = e.pointerType;
		if (e.pointerType === "mouse" || !e.isPrimary) return;
		cancel();
		start = { x: e.clientX, y: e.clientY };
		timer = window.setTimeout(() => {
			cancel();
			firedAt = Date.now();
			navigator.vibrate?.(10);
			onFire();
		}, ms);
		window.addEventListener("pointermove", onMove, { passive: true });
		window.addEventListener("pointerup", cancel);
		window.addEventListener("pointercancel", cancel);
	}

	/** Suppress the browser's link context menu / preview for touch long presses. */
	function onContextmenu(e: Event) {
		if (lastPointer !== "mouse") e.preventDefault();
	}

	/** True (once) when the current click is the tail of a long press and must not open the item. */
	function consumeClick(): boolean {
		const hit = Date.now() - firedAt < 800;
		firedAt = 0;
		return hit;
	}

	onBeforeUnmount(cancel);
	return { onPointerdown, onContextmenu, consumeClick };
}
