import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatTakenAt, fromDatetimeLocal, toDatetimeLocal } from "./format.ts";

describe("formatters", () => {
	it("formats sizes and durations", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
		expect(formatDuration(75.4)).toBe("1:15");
		expect(formatDuration(3725)).toBe("1:02:05");
	});

	it("renders capture times in their recorded offset", () => {
		const s = formatTakenAt("2024-05-01T10:00:00Z", "+02:00", "en-GB");
		expect(s).toContain("12:00");
		expect(s).toContain("UTC+02:00");
		expect(formatTakenAt(null, null)).toBe("");
	});

	it("round-trips datetime-local values", () => {
		const iso = "2024-05-01T10:30:00.000Z";
		expect(fromDatetimeLocal(toDatetimeLocal(iso))).toBe(iso);
		expect(fromDatetimeLocal("")).toBeNull();
	});
});

describe("map tiles", async () => {
	const { tileGrid } = await import("./mapTile.ts");
	it("centres the marker inside a 2x2 tile block", () => {
		const g = tileGrid("https://t/{z}/{x}/{y}.png", 48.2082, 16.3738, 14);
		expect(g.tiles).toHaveLength(4);
		expect(g.tiles[0]!.url).toMatch(/^https:\/\/t\/14\/\d+\/\d+\.png$/);
		expect(g.marker.x).toBeGreaterThanOrEqual(128);
		expect(g.marker.x).toBeLessThanOrEqual(384);
		expect(g.marker.y).toBeGreaterThanOrEqual(128);
		expect(g.marker.y).toBeLessThanOrEqual(384);
	});
});
