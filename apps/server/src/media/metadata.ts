import exifr from "exifr";
import { env } from "../env.ts";
import { log } from "../lib/log.ts";
import {
	EMPTY_METADATA,
	exifDateToIso,
	formatAperture,
	formatFocal,
	formatShutter,
	type MediaMetadata,
	mapProbe,
	num,
	type Probe,
	str,
} from "./metadata-map.ts";
import { run } from "./tools.ts";
import { ffprobeAvailable } from "./video.ts";

export { EMPTY_METADATA, type MediaMetadata } from "./metadata-map.ts";

/** EXIF/XMP metadata of an image file (JPEG, HEIC, TIFF, PNG, WebP, AVIF). Never throws. */
export async function readImageMetadata(path: string): Promise<MediaMetadata> {
	let x: Record<string, unknown> | undefined;
	try {
		x = await exifr.parse(path, {
			tiff: true,
			exif: true,
			gps: true,
			xmp: true,
			iptc: false,
			icc: false,
			jfif: false,
			ihdr: false,
			interop: false,
			ifd1: false,
			mergeOutput: true,
			translateValues: false,
		});
	} catch (err) {
		log.debug("exif parse failed", { path, err: String(err) });
	}
	if (!x) return { ...EMPTY_METADATA };
	const date = x.DateTimeOriginal ?? x.CreateDate ?? x.DateTimeDigitized ?? x.ModifyDate;
	const offset = x.OffsetTimeOriginal ?? x.OffsetTimeDigitized ?? x.OffsetTime;
	const { takenAt, takenAtTz } = exifDateToIso(date, offset);
	const lat = num(x.latitude);
	const lng = num(x.longitude);
	let alt = num(x.GPSAltitude);
	const altRef = x.GPSAltitudeRef;
	const below = altRef === 1 || (altRef instanceof Uint8Array && altRef[0] === 1);
	if (alt !== null && below) alt = -alt;
	const iso = num(x.ISO ?? x.ISOSpeedRatings ?? x.PhotographicSensitivity);
	const lens = str(x.LensModel) ?? str(x.Lens) ?? str(x.LensInfo);
	const orientation = num(x.Orientation);
	return {
		...EMPTY_METADATA,
		takenAt,
		takenAtTz,
		make: str(x.Make),
		model: str(x.Model),
		lens,
		iso: iso !== null ? String(Math.round(iso)) : null,
		aperture: formatAperture(x.FNumber ?? x.ApertureValue),
		shutter: formatShutter(x.ExposureTime),
		focal: formatFocal(x.FocalLength),
		latitude: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
		longitude: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
		altitude: alt,
		orientation: orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : null,
	};
}

/** ffprobe metadata of a video. Returns empty metadata when ffprobe is unavailable or fails. */
export async function readVideoMetadata(path: string): Promise<MediaMetadata> {
	if (!(await ffprobeAvailable())) return { ...EMPTY_METADATA };
	try {
		const out = await run(env.FFPROBE_PATH, [
			"-v",
			"quiet",
			"-print_format",
			"json",
			"-show_format",
			"-show_streams",
			path,
		]);
		return mapProbe(JSON.parse(out) as Probe);
	} catch (err) {
		log.warn("ffprobe failed", { path, err: String(err) });
		return { ...EMPTY_METADATA };
	}
}
