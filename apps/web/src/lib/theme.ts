import type { ThemePalette } from "@longan/shared";
import colors from "tailwindcss/colors";

export const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

type Palette = Record<(typeof SHADES)[number], string>;

/** Tailwind v4 palette (oklch strings) for a colour name, or null if unknown. */
export function paletteFor(name: string): Palette | null {
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
