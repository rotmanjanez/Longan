import { defineShortcuts } from "@nuxt/ui/composables";
import { computed } from "vue";
import { type RouteLocationRaw, useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui.ts";

/**
 * Route-driven lightbox navigation: `open` pushes the photo route, prev/next replace it (so Back closes
 * the lightbox), `close` goes back to the listing. Registers arrow left/right and escape while a photo is
 * open and no dialog sits on top.
 */
export function useLightboxNav(opts: {
	ids: () => readonly string[];
	current: () => string | null;
	location: (photoId: string | null) => RouteLocationRaw;
	onClose?: (lastPhotoId: string) => void;
}) {
	const router = useRouter();
	const ui = useUiStore();
	const index = computed(() => {
		const c = opts.current();
		return c ? opts.ids().indexOf(c) : -1;
	});
	const prevId = computed(() => (index.value > 0 ? (opts.ids()[index.value - 1] ?? null) : null));
	const nextId = computed(() =>
		index.value >= 0 && index.value < opts.ids().length - 1 ? (opts.ids()[index.value + 1] ?? null) : null,
	);
	const isOpen = computed(() => opts.current() !== null);

	function open(photoId: string) {
		router.push(opts.location(photoId));
	}
	function step(photoId: string) {
		router.replace(opts.location(photoId));
	}
	function close() {
		const last = opts.current();
		const target = router.resolve(opts.location(null)).fullPath;
		const back = (window.history.state as { back?: string } | null)?.back;
		if (back === target) router.back();
		else router.replace(opts.location(null));
		if (last) opts.onClose?.(last);
	}
	const prev = () => prevId.value && step(prevId.value);
	const next = () => nextId.value && step(nextId.value);

	defineShortcuts(
		computed(() =>
			isOpen.value && !ui.anyDialogOpen
				? { arrowleft: prev, arrowright: next, escape: close }
				: ({} as Record<string, () => void>),
		),
	);

	return { index, prevId, nextId, isOpen, open, step, close, prev, next };
}
