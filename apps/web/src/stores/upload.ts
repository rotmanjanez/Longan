import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type UploadStatus =
	| "queued"
	| "uploading"
	| "created"
	| "duplicate"
	| "skipped"
	| "error"
	| "cancelled";

export type UploadItem = {
	/** Client-side id. */
	id: string;
	file: File;
	/** Target album id, null = unsorted. */
	albumId: string | null;
	status: UploadStatus;
	/** 0..1 */
	progress: number;
	photoId?: string;
	message?: string;
};

/**
 * Upload queue state (skeleton). The upload UI and the worker that drains the queue against
 * `PUT /api/upload` live in components/upload (second web agent).
 */
export const useUploadStore = defineStore("upload", () => {
	const items = ref<UploadItem[]>([]);
	const targetAlbumId = ref<string | null>(null);
	let seq = 0;

	const pending = computed(() =>
		items.value.filter((i) => i.status === "queued" || i.status === "uploading"),
	);
	const done = computed(() => items.value.filter((i) => i.status !== "queued" && i.status !== "uploading"));
	const failed = computed(() => items.value.filter((i) => i.status === "error"));
	const isActive = computed(() => pending.value.length > 0);
	/** Overall progress 0..1 across all items. */
	const progress = computed(() =>
		items.value.length === 0
			? 0
			: items.value.reduce((s, i) => s + (i.status === "queued" ? 0 : i.progress), 0) / items.value.length,
	);

	function enqueue(files: Iterable<File>, albumId: string | null) {
		for (const file of files) {
			items.value.push({ id: `u${++seq}`, file, albumId, status: "queued", progress: 0 });
		}
	}
	function update(id: string, patch: Partial<Omit<UploadItem, "id" | "file">>) {
		const item = items.value.find((i) => i.id === id);
		if (item) Object.assign(item, patch);
	}
	function remove(id: string) {
		items.value = items.value.filter((i) => i.id !== id);
	}
	function clearFinished() {
		items.value = items.value.filter((i) => i.status === "queued" || i.status === "uploading");
	}

	return {
		items,
		targetAlbumId,
		pending,
		done,
		failed,
		isActive,
		progress,
		enqueue,
		update,
		remove,
		clearFinished,
	};
});
