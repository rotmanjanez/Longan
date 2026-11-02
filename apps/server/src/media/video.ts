import { stat } from "node:fs/promises";
import { env } from "../env.ts";
import { log } from "../lib/log.ts";
import { settingStr } from "../settings/index.ts";
import { safeUnlink, tmpFile } from "./storage.ts";
import { run } from "./tools.ts";

const probes = new Map<string, Promise<boolean>>();

/** Whether a binary runs (`<bin> -version`). Cached per binary; logs a warning once when missing. */
function available(bin: string): Promise<boolean> {
	let p = probes.get(bin);
	if (!p) {
		p = run(bin, ["-version"], 10_000).then(
			() => true,
			() => {
				log.warn(`${bin} not found: video metadata/thumbnails are skipped`, { bin });
				return false;
			},
		);
		probes.set(bin, p);
	}
	return p;
}

export const ffmpegAvailable = () => available(env.FFMPEG_PATH);
export const ffprobeAvailable = () => available(env.FFPROBE_PATH);

/**
 * Extract one frame of a video into a temporary JPEG (first frame or the middle one, per
 * `upload.video_thumb_at`). Returns null when ffmpeg is unavailable or extraction fails.
 * The caller deletes the returned file.
 */
export async function extractFrame(videoPath: string, durationSec: number | null): Promise<string | null> {
	if (!(await ffmpegAvailable())) return null;
	const at = await settingStr("upload.video_thumb_at", "middle");
	const seek = at === "middle" && durationSec && durationSec > 0.2 ? durationSec / 2 : 0;
	const out = await tmpFile(".jpg");
	const attempt = async (t: number) => {
		await run(env.FFMPEG_PATH, [
			"-v",
			"error",
			"-y",
			"-ss",
			t.toFixed(3),
			"-i",
			videoPath,
			"-frames:v",
			"1",
			"-q:v",
			"2",
			out,
		]);
		const s = await stat(out);
		if (s.size === 0) throw new Error("empty frame");
	};
	try {
		await attempt(seek);
		return out;
	} catch (err) {
		if (seek > 0) {
			try {
				await attempt(0);
				return out;
			} catch {
				// fall through
			}
		}
		log.warn("video frame extraction failed", { videoPath, err: String(err) });
		await safeUnlink(out);
		return null;
	}
}
