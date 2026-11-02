/**
 * Client side of the settings type DSL (server: apps/server/src/settings/validate.ts):
 *   bool | int | int:min:max | string | enum:a|b|c | json | color
 * `parseSettingType` drives which input the admin settings page renders, `checkSettingValue` mirrors the
 * server validation so obvious mistakes are flagged before saving (the server stays authoritative).
 */
export type SettingType =
	| { kind: "bool" }
	| { kind: "int"; min?: number; max?: number }
	| { kind: "string" }
	| { kind: "enum"; options: string[] }
	| { kind: "json" }
	| { kind: "color" }
	| { kind: "unknown"; raw: string };

function bound(s: string | undefined): number | undefined {
	if (s === undefined || s.trim() === "") return undefined;
	const n = Number(s);
	return Number.isFinite(n) ? n : undefined;
}

export function parseSettingType(type: string): SettingType {
	const [kind = "", ...rest] = type.split(":");
	switch (kind) {
		case "bool":
		case "string":
		case "json":
		case "color":
			return { kind };
		case "int": {
			const out: { kind: "int"; min?: number; max?: number } = { kind: "int" };
			const min = bound(rest[0]);
			const max = bound(rest[1]);
			if (min !== undefined) out.min = min;
			if (max !== undefined) out.max = max;
			return out;
		}
		case "enum": {
			const options = rest
				.join(":")
				.split("|")
				.filter((o) => o !== "");
			return options.length ? { kind: "enum", options } : { kind: "unknown", raw: type };
		}
		default:
			return { kind: "unknown", raw: type };
	}
}

const INT_RE = /^-?\d+$/;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns an error message key + params, or null when the value is acceptable. */
export function checkSettingValue(
	type: SettingType,
	value: string | null,
): { key: string; params?: Record<string, string | number> } | null {
	if (value === null) return type.kind === "string" ? null : { key: "settings.errors.required" };
	switch (type.kind) {
		case "bool":
			return ["1", "0", "true", "false"].includes(value.trim().toLowerCase())
				? null
				: { key: "settings.errors.bool" };
		case "int": {
			const v = value.trim();
			if (!INT_RE.test(v)) return { key: "settings.errors.int" };
			const n = Number.parseInt(v, 10);
			if (type.min !== undefined && n < type.min)
				return { key: "settings.errors.min", params: { min: type.min } };
			if (type.max !== undefined && n > type.max)
				return { key: "settings.errors.max", params: { max: type.max } };
			return null;
		}
		case "enum":
			return type.options.includes(value) ? null : { key: "settings.errors.enum" };
		case "json":
			try {
				JSON.parse(value);
				return null;
			} catch {
				return { key: "settings.errors.json" };
			}
		case "color":
			return COLOR_RE.test(value.trim()) ? null : { key: "settings.errors.color" };
		default:
			return null;
	}
}

/** "1"/"true" -> true. */
export function settingBool(value: string | null): boolean {
	const v = (value ?? "").trim().toLowerCase();
	return v === "1" || v === "true";
}

/** Settings grouped by category, keeping the server order (sort, key) inside and across groups. */
export function groupSettings<T extends { category: string }>(
	rows: readonly T[],
): { category: string; rows: T[] }[] {
	const groups = new Map<string, T[]>();
	for (const r of rows) {
		let g = groups.get(r.category);
		if (!g) {
			g = [];
			groups.set(r.category, g);
		}
		g.push(r);
	}
	return [...groups].map(([category, rs]) => ({ category, rows: rs }));
}
