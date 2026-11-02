import { describe, expect, it } from "vitest";
import { validateSettingValue as v } from "../settings/validate.ts";

describe("settings type DSL", () => {
	it("bool normalises to 1/0", () => {
		expect(v("bool", "true")).toEqual({ ok: true, value: "1" });
		expect(v("bool", "0")).toEqual({ ok: true, value: "0" });
		expect(v("bool", "yes").ok).toBe(false);
	});

	it("int with and without bounds", () => {
		expect(v("int", "42")).toEqual({ ok: true, value: "42" });
		expect(v("int", "-3")).toEqual({ ok: true, value: "-3" });
		expect(v("int", "4.2").ok).toBe(false);
		expect(v("int", "abc").ok).toBe(false);
		expect(v("int:100:1000", "100")).toEqual({ ok: true, value: "100" });
		expect(v("int:100:1000", "1000").ok).toBe(true);
		expect(v("int:100:1000", "99")).toEqual({ ok: false, reason: "must be >= 100" });
		expect(v("int:100:1000", "1001")).toEqual({ ok: false, reason: "must be <= 1000" });
	});

	it("enum", () => {
		expect(v("enum:square|justified|masonry|grid", "masonry").ok).toBe(true);
		expect(v("enum:square|justified", "grid").ok).toBe(false);
		expect(v("enum:none|CC-BY-4.0", "CC-BY-4.0").ok).toBe(true);
	});

	it("string accepts anything including null", () => {
		expect(v("string", "")).toEqual({ ok: true, value: "" });
		expect(v("string", null)).toEqual({ ok: true, value: null });
		expect(v("int", null).ok).toBe(false);
	});

	it("json", () => {
		expect(v("json", '{"primary-500":"#0ea5e9"}').ok).toBe(true);
		expect(v("json", "{nope").ok).toBe(false);
	});

	it("color", () => {
		expect(v("color", "#0EA5E9")).toEqual({ ok: true, value: "#0ea5e9" });
		expect(v("color", "#abc").ok).toBe(true);
		expect(v("color", "0ea5e9").ok).toBe(false);
		expect(v("color", "#12345").ok).toBe(false);
	});

	it("unknown type is rejected", () => {
		expect(v("float", "1").ok).toBe(false);
	});
});
