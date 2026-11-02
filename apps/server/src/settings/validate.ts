/**
 * Validation for the settings type DSL (see db/seed.ts):
 *   bool | int | int:min:max | string | enum:a|b|c | json | color
 * Returns the normalised value to store (bool -> "1"/"0", int -> canonical digits, color -> lowercase #rrggbb).
 */
export type SettingCheck = { ok: true; value: string | null } | { ok: false; reason: string };

const INT_RE = /^-?\d+$/;
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function validateSettingValue(type: string, value: string | null): SettingCheck {
	const [kind, ...rest] = type.split(":");
	if (value === null) {
		return kind === "string" ? { ok: true, value: null } : { ok: false, reason: "value is required" };
	}
	switch (kind) {
		case "bool": {
			const v = value.trim().toLowerCase();
			if (v === "1" || v === "true") return { ok: true, value: "1" };
			if (v === "0" || v === "false") return { ok: true, value: "0" };
			return { ok: false, reason: "expected a boolean (1/0/true/false)" };
		}
		case "int": {
			const v = value.trim();
			if (!INT_RE.test(v)) return { ok: false, reason: "expected an integer" };
			const n = Number.parseInt(v, 10);
			if (!Number.isSafeInteger(n)) return { ok: false, reason: "integer out of range" };
			const [min, max] = rest.map((x) => (x === "" ? undefined : Number(x)));
			if (min !== undefined && n < min) return { ok: false, reason: `must be >= ${min}` };
			if (max !== undefined && n > max) return { ok: false, reason: `must be <= ${max}` };
			return { ok: true, value: String(n) };
		}
		case "string":
			return { ok: true, value };
		case "enum": {
			const options = rest.join(":").split("|");
			if (options.includes(value)) return { ok: true, value };
			return { ok: false, reason: `expected one of ${options.join(", ")}` };
		}
		case "json":
			try {
				JSON.parse(value);
				return { ok: true, value };
			} catch {
				return { ok: false, reason: "invalid JSON" };
			}
		case "color": {
			const v = value.trim();
			if (!COLOR_RE.test(v)) return { ok: false, reason: "expected a colour like #0ea5e9" };
			return { ok: true, value: v.toLowerCase() };
		}
		default:
			return { ok: false, reason: `unknown setting type "${type}"` };
	}
}
