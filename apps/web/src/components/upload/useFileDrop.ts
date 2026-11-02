import { useEventListener } from "@vueuse/core";
import { ref } from "vue";

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

/**
 * Window-level file drag & drop (Lychee `uploadEvents`): `dragging` is true while files hover the page.
 * Drops are only accepted while `enabled()`.
 */
export function useFileDrop(enabled: () => boolean, onFiles: (files: File[]) => void) {
	const dragging = ref(false);
	let depth = 0;
	const target = typeof window !== "undefined" ? window : undefined;

	useEventListener(target, "dragenter", (e: DragEvent) => {
		if (!enabled() || !hasFiles(e)) return;
		e.preventDefault();
		depth++;
		dragging.value = true;
	});
	useEventListener(target, "dragover", (e: DragEvent) => {
		if (!enabled() || !hasFiles(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
	});
	useEventListener(target, "dragleave", () => {
		if (!dragging.value) return;
		depth = Math.max(0, depth - 1);
		if (depth === 0) dragging.value = false;
	});
	useEventListener(target, "drop", (e: DragEvent) => {
		depth = 0;
		dragging.value = false;
		if (!enabled() || !hasFiles(e) || e.defaultPrevented) return;
		e.preventDefault();
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length) onFiles(files);
	});
	return { dragging };
}
