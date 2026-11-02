import { useElementSize, useEventListener } from "@vueuse/core";
import { computed, type Ref, ref, watch } from "vue";
import {
	clampPan,
	distance,
	fitRect,
	IDENTITY,
	isZoomed,
	KEY_ZOOM_STEP,
	maxScale,
	midpoint,
	type PanZoomState,
	type Point,
	type Size,
	toggleZoomScale,
	wheelDelta,
	zoomAround,
} from "@/lib/panZoom.ts";

const SWIPE_MIN = 60;
const DOUBLE_TAP_MS = 300;

/**
 * Pointer-events pan/zoom for the lightbox stage (simplified port of Lychee's `usePanZoom`): wheel and pinch
 * zoom around the pointer, drag to pan while zoomed, double-click / double-tap toggles fit <-> 1:1, a
 * horizontal swipe while not zoomed reports `onSwipe`. Pure geometry lives in lib/panZoom.ts.
 */
export function usePanZoom(
	container: Ref<HTMLElement | null>,
	natural: () => Size,
	opts: { enabled: () => boolean; onSwipe?: (dir: "prev" | "next") => void },
) {
	const { width, height } = useElementSize(container);
	const size = computed<Size>(() => ({ width: width.value, height: height.value }));
	const fit = computed(() => fitRect(natural(), size.value));
	const max = computed(() => maxScale(natural().width, fit.value.width));
	const state = ref<PanZoomState>({ ...IDENTITY });
	/** True while a programmatic zoom animates (CSS transition on). */
	const animating = ref(false);
	const zoomed = computed(() => isZoomed(state.value));

	let animTimer: ReturnType<typeof setTimeout> | undefined;
	function set(next: PanZoomState, animate = false) {
		state.value = isZoomed(next) ? clampPan(next, fit.value, size.value) : { ...IDENTITY };
		if (animate) {
			animating.value = true;
			clearTimeout(animTimer);
			animTimer = setTimeout(() => (animating.value = false), 220);
		}
	}
	function reset() {
		set({ ...IDENTITY }, true);
	}
	const centre = (): Point => ({ x: size.value.width / 2, y: size.value.height / 2 });
	function zoomBy(factor: number, at: Point = centre(), animate = true) {
		set(zoomAround(state.value, at, state.value.scale * factor, max.value), animate);
	}
	function toggleAt(at: Point) {
		set(
			zoomAround(state.value, at, toggleZoomScale(state.value, natural().width, fit.value.width), max.value),
			true,
		);
	}

	// Re-clamp when the container resizes (details panel, fullscreen).
	watch(size, () => set(state.value));

	const local = (e: { clientX: number; clientY: number }): Point => {
		const r = container.value?.getBoundingClientRect();
		return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
	};

	const pointers = new Map<number, Point>();
	let gesture:
		| { kind: "pan"; start: Point; origin: PanZoomState; type: string; moved: number }
		| { kind: "pinch"; dist: number; mid: Point; origin: PanZoomState }
		| null = null;
	let lastTap = 0;
	let lastTouchToggle = 0;

	function beginGesture(type: string) {
		const pts = [...pointers.values()];
		if (pts.length >= 2) {
			gesture = {
				kind: "pinch",
				dist: distance(pts[0]!, pts[1]!),
				mid: midpoint(pts[0]!, pts[1]!),
				origin: state.value,
			};
		} else if (pts.length === 1) {
			gesture = { kind: "pan", start: pts[0]!, origin: state.value, type, moved: 0 };
		} else {
			gesture = null;
		}
	}

	useEventListener(container, "pointerdown", (e: PointerEvent) => {
		if (!opts.enabled() || (e.pointerType === "mouse" && e.button !== 0)) return;
		pointers.set(e.pointerId, local(e));
		(e.target as Element | null)?.setPointerCapture?.(e.pointerId);
		beginGesture(e.pointerType);
	});
	useEventListener(container, "pointermove", (e: PointerEvent) => {
		if (!pointers.has(e.pointerId) || !gesture) return;
		pointers.set(e.pointerId, local(e));
		const pts = [...pointers.values()];
		if (gesture.kind === "pinch" && pts.length >= 2) {
			const mid = midpoint(pts[0]!, pts[1]!);
			const scaled = zoomAround(
				gesture.origin,
				gesture.mid,
				(gesture.origin.scale * distance(pts[0]!, pts[1]!)) / Math.max(1, gesture.dist),
				max.value,
			);
			set({ ...scaled, x: scaled.x + mid.x - gesture.mid.x, y: scaled.y + mid.y - gesture.mid.y });
		} else if (gesture.kind === "pan") {
			const p = pts[0]!;
			gesture.moved = Math.max(gesture.moved, distance(p, gesture.start));
			if (isZoomed(gesture.origin)) {
				set({
					scale: gesture.origin.scale,
					x: gesture.origin.x + p.x - gesture.start.x,
					y: gesture.origin.y + p.y - gesture.start.y,
				});
			}
		}
	});
	function end(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		const p = local(e);
		pointers.delete(e.pointerId);
		const g = gesture;
		if (g?.kind === "pan" && pointers.size === 0) {
			const dx = p.x - g.start.x;
			const dy = p.y - g.start.y;
			if (
				!isZoomed(g.origin) &&
				g.type !== "mouse" &&
				Math.abs(dx) > SWIPE_MIN &&
				Math.abs(dx) > 1.5 * Math.abs(dy)
			) {
				opts.onSwipe?.(dx < 0 ? "next" : "prev");
			} else if (g.type === "touch" && g.moved < 10) {
				const now = Date.now();
				if (now - lastTap < DOUBLE_TAP_MS) {
					lastTap = 0;
					lastTouchToggle = now;
					toggleAt(p);
				} else {
					lastTap = now;
				}
			}
		}
		beginGesture(e.pointerType);
	}
	useEventListener(container, "pointerup", end);
	useEventListener(container, "pointercancel", end);
	useEventListener(container, "dblclick", (e: MouseEvent) => {
		if (!opts.enabled() || Date.now() - lastTouchToggle < 600) return;
		toggleAt(local(e));
	});
	useEventListener(
		container,
		"wheel",
		(e: WheelEvent) => {
			if (!opts.enabled()) return;
			e.preventDefault();
			const delta = wheelDelta(e, size.value.height);
			zoomBy(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), local(e), false);
		},
		{ passive: false },
	);

	const layerStyle = computed(() => ({
		transform: `translate(${state.value.x}px, ${state.value.y}px) scale(${state.value.scale})`,
		transformOrigin: "0 0",
		transition: animating.value ? "transform 200ms ease-out" : "none",
	}));
	const imageStyle = computed(() => ({
		left: `${fit.value.left}px`,
		top: `${fit.value.top}px`,
		width: `${fit.value.width}px`,
		height: `${fit.value.height}px`,
	}));

	return {
		state,
		zoomed,
		fit,
		size,
		layerStyle,
		imageStyle,
		reset,
		zoomIn: () => zoomBy(KEY_ZOOM_STEP),
		zoomOut: () => zoomBy(1 / KEY_ZOOM_STEP),
		toggleAt,
	};
}
