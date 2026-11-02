/** Small display formatters shared by the lightbox, upload list and admin pages. */

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 1536 -> "1.5 KB" (base 1024, one decimal above KB). */
export function formatBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
	let v = bytes;
	let i = 0;
	while (v >= 1024 && i < UNITS.length - 1) {
		v /= 1024;
		i++;
	}
	return `${i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)} ${UNITS[i]}`;
}

/** 75.4 -> "1:15", 3725 -> "1:02:05". */
export function formatDuration(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
	const s = Math.round(seconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const r = String(s % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

const OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/;

/**
 * Wall-clock rendering of a capture time in the timezone it was recorded in (`takenAtTz` like "+02:00"),
 * falling back to the viewer's timezone. Returns "" for null.
 */
export function formatTakenAt(iso: string | null, tz: string | null, locale?: string): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const opts: Intl.DateTimeFormatOptions = { dateStyle: "long", timeStyle: "short" };
	const m = tz ? OFFSET_RE.exec(tz) : null;
	if (m) {
		const offset = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
		const shifted = new Date(date.getTime() + offset);
		const text = new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(shifted);
		return `${text} (UTC${tz})`;
	}
	return new Intl.DateTimeFormat(locale, opts).format(date);
}

/** "2026-11-02T10:15:00Z" -> value for <input type="datetime-local"> in the viewer's local time. */
export function toDatetimeLocal(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Inverse of toDatetimeLocal: local wall clock -> ISO (UTC); "" -> null. */
export function fromDatetimeLocal(value: string): string | null {
	if (!value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
