import { describe, expect, it } from "vitest";
import {
	evalRate,
	exifDateToIso,
	formatAperture,
	formatFocal,
	formatShutter,
	mapProbe,
	parseIso6709,
} from "./metadata-map.ts";

describe("exif formatting", () => {
	it("formats aperture, shutter and focal length", () => {
		expect(formatAperture(2.8)).toBe("f/2.8");
		expect(formatAperture(0)).toBeNull();
		expect(formatShutter(0.004)).toBe("1/250");
		expect(formatShutter(1 / 60)).toBe("1/60");
		expect(formatShutter(2.5)).toBe("2.5s");
		expect(formatFocal(24)).toBe("24 mm");
		expect(formatFocal("bogus")).toBeNull();
	});

	it("keeps the wall clock of exifr's local dates and applies the offset", () => {
		const local = new Date(2023, 4, 1, 12, 34, 56);
		expect(exifDateToIso(local, "+02:00")).toEqual({
			takenAt: "2023-05-01T10:34:56.000Z",
			takenAtTz: "+02:00",
		});
		expect(exifDateToIso(local, undefined)).toEqual({ takenAt: "2023-05-01T12:34:56.000Z", takenAtTz: null });
		expect(exifDateToIso("2020:01:02 03:04:05", "-05:00").takenAt).toBe("2020-01-02T08:04:05.000Z");
		expect(exifDateToIso("0000:00:00 00:00:00", null).takenAt).toBeNull();
	});
});

describe("ffprobe mapping", () => {
	it("evaluates frame rates", () => {
		expect(evalRate("30000/1001")).toBe(29.97);
		expect(evalRate("25/1")).toBe(25);
		expect(evalRate("0/0")).toBeNull();
	});

	it("parses ISO 6709 locations", () => {
		expect(parseIso6709("+48.8577+002.2950+035.000/")).toEqual({ lat: 48.8577, lng: 2.295, alt: 35 });
		expect(parseIso6709("garbage")).toBeNull();
	});

	it("swaps dimensions for rotated phone videos and reads Apple tags", () => {
		const m = mapProbe({
			streams: [
				{ codec_type: "audio" },
				{
					codec_type: "video",
					width: 1920,
					height: 1080,
					r_frame_rate: "30/1",
					side_data_list: [{ rotation: -90 }],
				},
			],
			format: {
				duration: "12.345678",
				tags: {
					creation_time: "2024-06-01T10:00:00.000000Z",
					"com.apple.quicktime.creationdate": "2024-06-01T12:00:00+0200",
					"com.apple.quicktime.make": "Apple",
					"com.apple.quicktime.model": "iPhone 15",
					"com.apple.quicktime.location.ISO6709": "+48.8577+002.2950+035.000/",
				},
			},
		});
		expect(m).toMatchObject({
			width: 1080,
			height: 1920,
			fps: 30,
			duration: 12.346,
			takenAt: "2024-06-01T10:00:00.000Z",
			takenAtTz: "+02:00",
			make: "Apple",
			model: "iPhone 15",
			latitude: 48.8577,
			longitude: 2.295,
		});
	});

	it("ignores QuickTime epoch dates and missing streams", () => {
		const m = mapProbe({ format: { tags: { creation_time: "1904-01-01T00:00:00Z" } } });
		expect(m.takenAt).toBeNull();
		expect(m.width).toBeNull();
	});
});
