/** Pure metadata helpers (formatting, EXIF dates, ffprobe JSON mapping). No IO, no env. */

/** Everything is optional: unknown values are null. */
export type MediaMetadata = {
	/** ISO 8601 instant. When the source has no offset the wall-clock time is stored as UTC. */
	takenAt: string | null;
	/** Original UTC offset ("+02:00") when the source recorded one. */
	takenAtTz: string | null;
	make: string | null;
	model: string | null;
	lens: string | null;
	iso: string | null;
	aperture: string | null;
	shutter: string | null;
	focal: string | null;
	latitude: number | null;
	longitude: number | null;
	altitude: number | null;
	orientation: number | null;
	duration: number | null;
	fps: number | null;
	/** Display dimensions (rotation applied); videos only. */
	width: number | null;
	height: number | null;
};

export const EMPTY_METADATA: MediaMetadata = {
	takenAt: null,
	takenAtTz: null,
	make: null,
	model: null,
	lens: null,
	iso: null,
	aperture: null,
	shutter: null,
	focal: null,
	latitude: null,
	longitude: null,
	altitude: null,
	orientation: null,
	duration: null,
	fps: null,
	width: null,
	height: null,
};

export const str = (v: unknown): string | null => {
	if (typeof v === "number" && Number.isFinite(v)) return String(v);
	if (typeof v !== "string") return null;
	const s = v.replace(/\0/g, "").trim();
	return s === "" ? null : s;
};
export const num = (v: unknown): number | null => {
	const n = typeof v === "string" ? Number.parseFloat(v) : v;
	return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const round = (n: number, digits: number) => Number(n.toFixed(digits));

export function formatAperture(f: unknown): string | null {
	const n = num(f);
	return n && n > 0 ? `f/${round(n, 1)}` : null;
}
export function formatShutter(t: unknown): string | null {
	const n = num(t);
	if (!n || n <= 0) return null;
	if (n < 0.3) return `1/${Math.round(1 / n)}`;
	return `${round(n, 1)}s`;
}
export function formatFocal(f: unknown): string | null {
	const n = num(f);
	return n && n > 0 ? `${round(n, 1)} mm` : null;
}

const OFFSET_RE = /^[+-]\d{2}:\d{2}$/;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/**
 * exifr revives EXIF dates as local-time Date objects. Read the wall clock back from the local components
 * and attach the recorded offset (or UTC when none).
 */
export function exifDateToIso(
	d: unknown,
	offset: unknown,
): { takenAt: string | null; takenAtTz: string | null } {
	let wall: string | null = null;
	if (d instanceof Date && !Number.isNaN(d.getTime())) {
		wall = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	} else if (typeof d === "string") {
		const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(d);
		if (m && m[1] !== "0000") wall = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
	}
	if (!wall) return { takenAt: null, takenAtTz: null };
	const tz = typeof offset === "string" && OFFSET_RE.test(offset.trim()) ? offset.trim() : null;
	const date = new Date(`${wall}${tz ?? "Z"}`);
	if (Number.isNaN(date.getTime())) return { takenAt: null, takenAtTz: null };
	return { takenAt: date.toISOString(), takenAtTz: tz };
}

type ProbeStream = {
	codec_type?: string;
	width?: number;
	height?: number;
	r_frame_rate?: string;
	avg_frame_rate?: string;
	tags?: Record<string, string>;
	side_data_list?: Array<{ rotation?: number | string }>;
};
export type Probe = {
	streams?: ProbeStream[];
	format?: { duration?: string; tags?: Record<string, string> };
};

export function evalRate(r: string | undefined): number | null {
	if (!r) return null;
	const [a, b] = r.split("/").map(Number);
	if (a === undefined || !Number.isFinite(a)) return null;
	const v = b === undefined ? a : b === 0 ? Number.NaN : a / b;
	return Number.isFinite(v) && v > 0 ? round(v, 3) : null;
}

/** ISO 6709 location as written by phones in QuickTime tags ("+48.8577+002.2950+035.000/"). */
export function parseIso6709(s: string | undefined): { lat: number; lng: number; alt: number | null } | null {
	if (!s) return null;
	const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?/.exec(s.trim());
	if (!m) return null;
	const lat = Number(m[1]);
	const lng = Number(m[2]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
		return null;
	return { lat, lng, alt: m[3] !== undefined ? Number(m[3]) : null };
}

/** Pure mapping of ffprobe JSON to metadata (exported for tests). */
export function mapProbe(p: Probe): MediaMetadata {
	const v = p.streams?.find((s) => s.codec_type === "video");
	const ftags = p.format?.tags ?? {};
	const vtags = v?.tags ?? {};
	const rotRaw = v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? vtags.rotate;
	const rotation = Math.abs(Number(rotRaw ?? 0)) % 180;
	let width = v?.width ?? null;
	let height = v?.height ?? null;
	if (rotation === 90 && width !== null && height !== null) [width, height] = [height, width];
	const created = ftags.creation_time ?? vtags.creation_time ?? ftags["com.apple.quicktime.creationdate"];
	let takenAt: string | null = null;
	let takenAtTz: string | null = null;
	const appleDate = ftags["com.apple.quicktime.creationdate"];
	if (appleDate) {
		const m = /([+-]\d{2}):?(\d{2})$/.exec(appleDate);
		const d = new Date(appleDate);
		if (!Number.isNaN(d.getTime())) {
			takenAt = d.toISOString();
			takenAtTz = m ? `${m[1]}:${m[2]}` : null;
		}
	}
	if (!takenAt && created) {
		const d = new Date(created);
		// QuickTime writers without a clock store 1904-01-01 / 1970-01-01.
		if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1971) takenAt = d.toISOString();
	}
	const loc = parseIso6709(ftags.location ?? ftags["com.apple.quicktime.location.ISO6709"]);
	const duration = num(p.format?.duration);
	return {
		...EMPTY_METADATA,
		takenAt,
		takenAtTz,
		make: str(ftags["com.apple.quicktime.make"] ?? ftags.make),
		model: str(ftags["com.apple.quicktime.model"] ?? ftags.model),
		latitude: loc?.lat ?? null,
		longitude: loc?.lng ?? null,
		altitude: loc?.alt ?? null,
		duration: duration !== null ? round(duration, 3) : null,
		fps: evalRate(v?.r_frame_rate) ?? evalRate(v?.avg_frame_rate),
		width,
		height,
	};
}
