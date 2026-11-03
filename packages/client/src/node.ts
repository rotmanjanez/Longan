import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import type { LonganClient } from "./index.ts";
import type { UploadOptions, UploadResult } from "./upload.ts";

/**
 * Uploads a file from disk (Node.js >= 20). The file is streamed, not read into memory. `name` defaults to the
 * file's base name and `mtime` to its modification time.
 */
export async function uploadFile(
	client: LonganClient,
	path: string,
	options: UploadOptions = {},
): Promise<UploadResult> {
	const [blob, info] = await Promise.all([openAsBlob(path), stat(path)]);
	return client.upload(blob, {
		...options,
		name: options.name ?? basename(path),
		mtime: options.mtime ?? info.mtimeMs,
	});
}
