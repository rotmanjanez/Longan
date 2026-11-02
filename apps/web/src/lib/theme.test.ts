import { describe, expect, it } from "vitest";
import { applyTheme, themeVariables } from "./theme.ts";

describe("theme variables", () => {
	it("maps the Tailwind palettes onto the Nuxt UI tokens and lets overrides win", () => {
		const vars = themeVariables({
			primary: "rose",
			neutral: "zinc",
			overrides: { "primary-500": "#ff0000" },
		});
		expect(Object.keys(vars).filter((k) => k.startsWith("--ui-color-neutral-"))).toHaveLength(11);
		expect(vars["--ui-color-primary-400"]).toMatch(/^oklch\(/);
		expect(vars["--ui-color-primary-500"]).toBe("#ff0000");
	});

	it("ignores malformed override tokens", () => {
		const vars = themeVariables({ primary: "sky", neutral: "slate", overrides: { "bad token": "x" } });
		expect(Object.keys(vars).some((k) => k.includes("bad"))).toBe(false);
	});

	it("sets and replaces the variables on :root", () => {
		const root = document.createElement("div");
		applyTheme({ primary: "sky", neutral: "slate", overrides: { "secondary-500": "#123456" } }, root);
		expect(root.style.getPropertyValue("--ui-color-secondary-500")).toBe("#123456");
		applyTheme({ primary: "sky", neutral: "slate", overrides: {} }, root);
		expect(root.style.getPropertyValue("--ui-color-secondary-500")).toBe("");
		expect(root.style.getPropertyValue("--ui-color-primary-500")).not.toBe("");
	});
});
