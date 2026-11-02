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
	/** Error code (HTTP-ish: PAYLOAD_TOO_LARGE, FORBIDDEN, NETWORK, ...) for error items. */
	code?: string;
	message?: string;
	/** False for items that cannot succeed by retrying (rejected client-side for size). */
	retryable?: boolean;
};

/** Body of `PUT /api/upload` (apps/server/src/http/upload.ts). */
export type UploadResponse = {
	status: "created" | "duplicate" | "skipped" | "error";
	photoId?: string;
	message?: string;
	error?: { code: string; message: string };
};

export type UploadResult =
	| { ok: true; status: "created" | "duplicate" | "skipped"; photoId?: string }
	| { ok: false; code: string; message: string; aborted?: boolean };

export type UploadHandle = { promise: Promise<UploadResult>; abort: () => void };
export type UploadTransport = (
	file: File,
	albumId: string | null,
	onProgress: (fraction: number) => void,
) => UploadHandle;

const STATUS_CODES: Record<number, string> = {
	400: "BAD_REQUEST",
	401: "UNAUTHORIZED",
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	413: "PAYLOAD_TOO_LARGE",
	415: "UNSUPPORTED_MEDIA_TYPE",
	500: "INTERNAL_SERVER_ERROR",
};

/** Query string of the upload route: album (empty = unsorted), file name, file mtime in ms. */
export function uploadUrl(file: File, albumId: string | null): string {
	const params = new URLSearchParams({
		album: albumId ?? "",
		name: file.name,
		mtime: String(Math.round(file.lastModified || Date.now())),
	});
	return `/api/upload?${params.toString()}`;
}

/** Interprets an upload response (status + body text) into a result. */
export function parseUploadResponse(status: number, text: string): UploadResult {
	let body: UploadResponse | null = null;
	try {
		body = text ? (JSON.parse(text) as UploadResponse) : null;
	} catch {
		body = null;
	}
	if (status >= 200 && status < 300 && body && body.status !== "error") {
		return { ok: true, status: body.status, photoId: body.photoId };
	}
	return {
		ok: false,
		code: body?.error?.code ?? STATUS_CODES[status] ?? (status === 0 ? "NETWORK" : `HTTP_${status}`),
		message: body?.error?.message ?? body?.message ?? (text && !body ? text.slice(0, 200) : ""),
	};
}

/** Default transport: XHR PUT with the raw file body (XHR because fetch has no upload progress). */
export const xhrTransport: UploadTransport = (file, albumId, onProgress) => {
	const xhr = new XMLHttpRequest();
	const promise = new Promise<UploadResult>((resolve) => {
		xhr.open("PUT", uploadUrl(file, albumId));
		xhr.withCredentials = true;
		xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
		};
		xhr.onload = () => resolve(parseUploadResponse(xhr.status, xhr.responseText));
		xhr.onerror = () => resolve({ ok: false, code: "NETWORK", message: "" });
		xhr.ontimeout = () => resolve({ ok: false, code: "TIMEOUT", message: "" });
		xhr.onabort = () => resolve({ ok: false, code: "ABORTED", message: "", aborted: true });
		xhr.send(file);
	});
	return { promise, abort: () => xhr.abort() };
};

/** File types offered by the picker (HEIC often has an empty MIME type, hence the extensions). */
export const UPLOAD_ACCEPT = "image/*,video/*,.heic,.heif,.avif,.webp,.mov,.mp4,.m4v,.mkv,.webm";

/**
 * Upload queue: items are drained by at most `parallelism` concurrent transfers. Size violations are
 * rejected client-side (not retryable). `onBatchDone` runs once the queue becomes idle after at least one
 * success (the app uses it to invalidate album/photo queries).
 */
export const useUploadStore = defineStore("upload", () => {
	const items = ref<UploadItem[]>([]);
	const targetAlbumId = ref<string | null>(null);
	const parallelism = ref(3);
	const maxBytes = ref(Number.POSITIVE_INFINITY);
	let transport: UploadTransport = xhrTransport;
	const handles = new Map<string, UploadHandle>();
	const listeners = new Set<(succeeded: UploadItem[]) => void>();
	let succeededSinceIdle: UploadItem[] = [];
	let seq = 0;

	const pending = computed(() =>
		items.value.filter((i) => i.status === "queued" || i.status === "uploading"),
	);
	const uploading = computed(() => items.value.filter((i) => i.status === "uploading"));
	const done = computed(() => items.value.filter((i) => i.status !== "queued" && i.status !== "uploading"));
	const succeeded = computed(() =>
		items.value.filter((i) => i.status === "created" || i.status === "duplicate" || i.status === "skipped"),
	);
	const failed = computed(() => items.value.filter((i) => i.status === "error"));
	const isActive = computed(() => pending.value.length > 0);
	/** Overall progress 0..1 across all non-cancelled items. */
	const progress = computed(() => {
		const list = items.value.filter((i) => i.status !== "cancelled");
		if (list.length === 0) return 0;
		return (
			list.reduce((s, i) => s + (i.status === "queued" ? 0 : i.status === "uploading" ? i.progress : 1), 0) /
			list.length
		);
	});

	function configure(opts: { parallelism?: number; maxBytes?: number; transport?: UploadTransport }) {
		if (opts.parallelism !== undefined) parallelism.value = Math.max(1, Math.floor(opts.parallelism));
		if (opts.maxBytes !== undefined && opts.maxBytes > 0) maxBytes.value = opts.maxBytes;
		if (opts.transport) transport = opts.transport;
		pump();
	}

	function onBatchDone(fn: (succeeded: UploadItem[]) => void): () => void {
		listeners.add(fn);
		return () => listeners.delete(fn);
	}

	function find(id: string) {
		return items.value.find((i) => i.id === id);
	}

	function enqueue(files: Iterable<File>, albumId: string | null): UploadItem[] {
		const added: UploadItem[] = [];
		for (const file of files) {
			const item: UploadItem = { id: `u${++seq}`, file, albumId, status: "queued", progress: 0 };
			if (file.size > maxBytes.value) {
				Object.assign(item, { status: "error", code: "PAYLOAD_TOO_LARGE", retryable: false });
			}
			items.value.push(item);
			added.push(item);
		}
		pump();
		return added;
	}

	function start(item: UploadItem) {
		const id = item.id;
		const live = () => find(id);
		Object.assign(item, { status: "uploading", progress: 0, code: undefined, message: undefined });
		const handle = transport(item.file, item.albumId, (fraction) => {
			// Whole percent steps only: XHR fires progress events far more often, and every write re-renders.
			const p = Math.round(Math.min(1, Math.max(0, fraction)) * 100) / 100;
			const it = live();
			if (it && it.status === "uploading" && it.progress !== p) it.progress = p;
		});
		handles.set(id, handle);
		handle.promise.then((result) => {
			handles.delete(id);
			const it = live();
			if (it && it.status === "uploading") {
				if (result.ok) {
					Object.assign(it, { status: result.status, progress: 1, photoId: result.photoId });
					succeededSinceIdle.push(it);
				} else if (result.aborted) {
					Object.assign(it, { status: "cancelled", progress: 0 });
				} else {
					Object.assign(it, {
						status: "error",
						code: result.code,
						message: result.message,
						retryable: result.code !== "PAYLOAD_TOO_LARGE",
					});
				}
			}
			pump();
		});
	}

	/** Starts queued items up to the parallelism limit; fires `onBatchDone` when idle. */
	function pump() {
		let running = items.value.filter((i) => i.status === "uploading").length;
		for (const item of items.value) {
			if (running >= parallelism.value) break;
			if (item.status !== "queued") continue;
			start(item);
			running++;
		}
		if (running === 0 && succeededSinceIdle.length > 0) {
			const batch = succeededSinceIdle;
			succeededSinceIdle = [];
			for (const fn of listeners) fn(batch);
		}
	}

	function retry(id: string) {
		const it = find(id);
		if (!it || (it.status !== "error" && it.status !== "cancelled") || it.retryable === false) return;
		Object.assign(it, { status: "queued", progress: 0, code: undefined, message: undefined });
		pump();
	}

	function retryFailed() {
		for (const it of items.value) {
			if ((it.status === "error" || it.status === "cancelled") && it.retryable !== false) {
				Object.assign(it, { status: "queued", progress: 0, code: undefined, message: undefined });
			}
		}
		pump();
	}

	function cancel(id: string) {
		const it = find(id);
		if (!it) return;
		if (it.status === "queued") {
			it.status = "cancelled";
		} else if (it.status === "uploading") {
			it.status = "cancelled";
			it.progress = 0;
			handles.get(id)?.abort();
			handles.delete(id);
			pump();
		}
	}

	function cancelAll() {
		for (const it of [...items.value]) cancel(it.id);
	}

	function update(id: string, patch: Partial<Omit<UploadItem, "id" | "file">>) {
		const item = find(id);
		if (item) Object.assign(item, patch);
	}
	function remove(id: string) {
		cancel(id);
		items.value = items.value.filter((i) => i.id !== id);
	}
	function clearFinished() {
		items.value = items.value.filter((i) => i.status === "queued" || i.status === "uploading");
	}

	return {
		items,
		targetAlbumId,
		parallelism,
		maxBytes,
		pending,
		uploading,
		done,
		succeeded,
		failed,
		isActive,
		progress,
		configure,
		onBatchDone,
		enqueue,
		retry,
		retryFailed,
		cancel,
		cancelAll,
		update,
		remove,
		clearFinished,
	};
});
