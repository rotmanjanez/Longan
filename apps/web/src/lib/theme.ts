import type { ThemePalette } from "@longan/shared";
import colors from "tailwindcss/colors";

export const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

type Palette = Record<(typeof SHADES)[number], string>;

/**
 * Longan's own palettes on top of Tailwind's. Keep in sync with the `--color-*` tokens in style.css (build-time
 * default theme). alpine: muted, pastel alpine green accent. moss: neutrals whose dark end is a deep forest green
 * (dark-mode surfaces), light end near-neutral (text).
 */
export const CUSTOM_PALETTES: Record<string, Palette> = {
	alpine: {
		"50": "oklch(0.94 0.02 158)",
		"100": "oklch(0.89 0.032 158)",
		"200": "oklch(0.81 0.046 158)",
		"300": "oklch(0.71 0.056 158)",
		"400": "oklch(0.59 0.06 158)",
		"500": "oklch(0.48 0.056 158)",
		"600": "oklch(0.41 0.05 158)",
		"700": "oklch(0.355 0.044 158)",
		"800": "oklch(0.3 0.037 158)",
		"900": "oklch(0.255 0.03 158)",
		"950": "oklch(0.19 0.022 158)",
	},
	moss: {
		"50": "oklch(0.985 0.004 160)",
		"100": "oklch(0.964 0.007 160)",
		"200": "oklch(0.924 0.011 160)",
		"300": "oklch(0.86 0.016 160)",
		"400": "oklch(0.69 0.022 160)",
		"500": "oklch(0.53 0.026 160)",
		"600": "oklch(0.36 0.03 160)",
		"700": "oklch(0.27 0.031 160)",
		"800": "oklch(0.2 0.029 160)",
		"900": "oklch(0.145 0.024 160)",
		"950": "oklch(0.11 0.018 160)",
	},
};

/** Palette (oklch strings) for a colour name (custom or Tailwind v4), or null if unknown. */
export function paletteFor(name: string): Palette | null {
	if (Object.hasOwn(CUSTOM_PALETTES, name)) return CUSTOM_PALETTES[name] ?? null;
	const p = (colors as unknown as Record<string, unknown>)[name];
	if (!p || typeof p !== "object") return null;
	return p as Palette;
}

/**
 * CSS custom properties for a theme: `--ui-color-primary-<shade>` / `--ui-color-neutral-<shade>` mapped from
 * the Tailwind palettes, then `overrides` (`{ "primary-500": "#0ea5e9" }` -> `--ui-color-primary-500`) win.
 */
export function themeVariables(theme: ThemePalette): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const [role, name] of [
		["primary", theme.primary],
		["neutral", theme.neutral],
	] as const) {
		const palette = paletteFor(name);
		if (!palette) continue;
		for (const shade of SHADES) vars[`--ui-color-${role}-${shade}`] = palette[shade];
	}
	for (const [token, value] of Object.entries(theme.overrides ?? {})) {
		if (/^[a-z]+-\d{2,3}$/.test(token) && value) vars[`--ui-color-${token}`] = value;
	}
	return vars;
}

let applied: string[] = [];

/** Sets the theme variables inline on `:root` (inline style beats the build-time stylesheet). */
export function applyTheme(theme: ThemePalette, root: HTMLElement = document.documentElement): void {
	for (const key of applied) root.style.removeProperty(key);
	const vars = themeVariables(theme);
	for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
	applied = Object.keys(vars);
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `theme.overrides` JSON -> token -> colour (anything malformed reads as no overrides). */
export function parseOverrides(raw: string | null | undefined): Record<string, string> {
	try {
		const v = JSON.parse(raw ?? "{}");
		if (!v || typeof v !== "object" || Array.isArray(v)) return {};
		return Object.fromEntries(
			Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"),
		);
	} catch {
		return {};
	}
}

/** Override tokens whose value is not a hex colour (blocks saving, skipped in the live preview). */
export function invalidOverrideTokens(overrides: Record<string, string>): Set<string> {
	return new Set(
		Object.entries(overrides)
			.filter(([, v]) => v.trim() !== "" && !HEX_RE.test(v.trim()))
			.map(([k]) => k),
	);
}
