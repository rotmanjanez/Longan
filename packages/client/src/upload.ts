/** Anything `fetch` can send as a request body. Pass a `File` to default `name` and `mtime` from it. */
export type UploadBody = Blob | ArrayBuffer | ArrayBufferView<ArrayBuffer> | ReadableStream<Uint8Array>;

export type UploadOptions = {
	/**
	 * File name including the extension (`IMG_0042.jpg`). The photo title is derived from it and the extension
	 * helps detect the media type. Required unless the body is a `File`.
	 */
	name?: string;
	/** Target album id. Omit (or null) to upload to the uploader's Unsorted. */
	albumId?: string | null;
	/** Original file modification time (Date or epoch ms). Defaults to `File.lastModified` for File bodies. */
	mtime?: Date | number;
	signal?: AbortSignal;
};

export type UploadResult = {
	/** `created`: new photo. `duplicate`: same file (SHA-1) already in Longan; `photoId` is the existing photo. */
	status: "created" | "duplicate" | "skipped";
	photoId: string;
};

const STATUS_CODES: Record<number, string> = {
	400: "BAD_REQUEST",
	401: "UNAUTHORIZED",
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	413: "PAYLOAD_TOO_LARGE",
	415: "UNSUPPORTED_MEDIA_TYPE",
	500: "INTERNAL_SERVER_ERROR",
};

export class LonganUploadError extends Error {
	override name = "LonganUploadError";
	/** HTTP status (0 when the request never got a response). */
	readonly status: number;
	/** `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `NETWORK`, ... */
	readonly code: string;
	constructor(message: string, status: number, code: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

/** Query string for `PUT /api/upload` (apps/server/src/http/upload.ts). */
export function uploadQuery(body: UploadBody, options: UploadOptions): URLSearchParams {
	const file = typeof File !== "undefined" && body instanceof File ? body : null;
	const name = options.name ?? file?.name;
	if (!name) throw new TypeError("upload: `name` is required unless the body is a File");
	const params = new URLSearchParams({ name });
	if (options.albumId) params.set("album", options.albumId);
	const mtime = options.mtime ?? file?.lastModified;
	if (mtime !== undefined) {
		const ms = typeof mtime === "number" ? mtime : mtime.getTime();
		if (Number.isFinite(ms) && ms > 0) params.set("mtime", String(Math.round(ms)));
	}
	return params;
}

export async function parseUploadResponse(res: Response): Promise<UploadResult> {
	const text = await res.text();
	let body: { status?: unknown; photoId?: unknown; message?: unknown } | null = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = null;
	}
	if (res.ok && body && typeof body.photoId === "string" && body.status !== "error") {
		return { status: body.status as UploadResult["status"], photoId: body.photoId };
	}
	const message =
		typeof body?.message === "string" && body.message
			? body.message
			: text && !body
				? text.slice(0, 200)
				: `upload failed: HTTP ${res.status}`;
	throw new LonganUploadError(message, res.status, STATUS_CODES[res.status] ?? `HTTP_${res.status}`);
}
