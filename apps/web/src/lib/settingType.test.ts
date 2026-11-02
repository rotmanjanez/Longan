import { describe, expect, it } from "vitest";
import { checkSettingValue, groupSettings, parseSettingType, settingBool } from "./settingType.ts";

describe("setting type DSL", () => {
	it("parses every kind", () => {
		expect(parseSettingType("bool")).toEqual({ kind: "bool" });
		expect(parseSettingType("string")).toEqual({ kind: "string" });
		expect(parseSettingType("json")).toEqual({ kind: "json" });
		expect(parseSettingType("color")).toEqual({ kind: "color" });
		expect(parseSettingType("int")).toEqual({ kind: "int" });
		expect(parseSettingType("int:1:8")).toEqual({ kind: "int", min: 1, max: 8 });
		expect(parseSettingType("int::100")).toEqual({ kind: "int", max: 100 });
		expect(parseSettingType("int:-5")).toEqual({ kind: "int", min: -5 });
		expect(parseSettingType("enum:a|b|c")).toEqual({ kind: "enum", options: ["a", "b", "c"] });
		expect(parseSettingType("enum:CC0|CC-BY-4.0")).toEqual({ kind: "enum", options: ["CC0", "CC-BY-4.0"] });
	});

	it("keeps unknown and malformed types visible as raw", () => {
		expect(parseSettingType("float")).toEqual({ kind: "unknown", raw: "float" });
		expect(parseSettingType("enum:")).toEqual({ kind: "unknown", raw: "enum:" });
		expect(parseSettingType("")).toEqual({ kind: "unknown", raw: "" });
	});

	it("checks values like the server", () => {
		const int = parseSettingType("int:80:800");
		expect(checkSettingValue(int, "200")).toBeNull();
		expect(checkSettingValue(int, "12.5")?.key).toBe("settings.errors.int");
		expect(checkSettingValue(int, "10")).toEqual({ key: "settings.errors.min", params: { min: 80 } });
		expect(checkSettingValue(int, "900")).toEqual({ key: "settings.errors.max", params: { max: 800 } });
		expect(checkSettingValue(parseSettingType("bool"), "true")).toBeNull();
		expect(checkSettingValue(parseSettingType("bool"), "yes")?.key).toBe("settings.errors.bool");
		expect(checkSettingValue(parseSettingType("enum:a|b"), "c")?.key).toBe("settings.errors.enum");
		expect(checkSettingValue(parseSettingType("json"), "{")?.key).toBe("settings.errors.json");
		expect(checkSettingValue(parseSettingType("json"), '{"a":1}')).toBeNull();
		expect(checkSettingValue(parseSettingType("color"), "#0ea5e9")).toBeNull();
		expect(checkSettingValue(parseSettingType("color"), "sky")?.key).toBe("settings.errors.color");
		expect(checkSettingValue(parseSettingType("string"), null)).toBeNull();
		expect(checkSettingValue(parseSettingType("int"), null)?.key).toBe("settings.errors.required");
	});

	it("reads booleans and groups rows by category in order", () => {
		expect(settingBool("1")).toBe(true);
		expect(settingBool("true")).toBe(true);
		expect(settingBool("0")).toBe(false);
		expect(settingBool(null)).toBe(false);
		const rows = [
			{ key: "a", category: "Gallery" },
			{ key: "b", category: "Theme" },
			{ key: "c", category: "Gallery" },
		];
		expect(groupSettings(rows)).toEqual([
			{ category: "Gallery", rows: [rows[0], rows[2]] },
			{ category: "Theme", rows: [rows[1]] },
		]);
	});
});
