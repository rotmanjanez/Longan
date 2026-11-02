import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

/** Run a binary, resolve stdout. Rejects with stderr on a non-zero exit. */
export function run(bin: string, args: string[], timeoutMs = 120_000): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(bin, args, { maxBuffer: 32 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
			if (err)
				reject(
					new Error(
						`${bin} failed: ${String(stderr || err.message)
							.trim()
							.slice(0, 500)}`,
					),
				);
			else resolve(stdout);
		});
	});
}

/** Absolute path of an executable (absolute path or looked up on PATH), or null. */
export async function which(bin: string): Promise<string | null> {
	const candidates = isAbsolute(bin)
		? [bin]
		: (process.env.PATH ?? "")
				.split(delimiter)
				.filter(Boolean)
				.map((d) => join(d, bin));
	for (const c of candidates) {
		try {
			await access(c, constants.X_OK);
			return c;
		} catch {
			// next
		}
	}
	return null;
}

let heif: Promise<string | null> | null = null;
/** libheif's command line decoder (`heif-dec`, formerly `heif-convert`), used when sharp cannot decode HEVC. */
export function heifDecoder(): Promise<string | null> {
	heif ??= (async () => (await which("heif-dec")) ?? (await which("heif-convert")))();
	return heif;
}
