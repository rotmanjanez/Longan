import { describe, expect, it } from "vitest";
import { canMovePhotoFrom } from "./albums.ts";

const photo = (ownerId: number, canMove: boolean) => ({ ownerId, rights: { canMove } });

describe("canMovePhotoFrom", () => {
	it("uses the per-photo move right inside a real album", () => {
		expect(canMovePhotoFrom("iYxkVbN2N-wyOtVvicgzNZPl", photo(2, true), { id: 3, isAdmin: false })).toBe(
			true,
		);
		expect(canMovePhotoFrom("iYxkVbN2N-wyOtVvicgzNZPl", photo(2, false), { id: 2, isAdmin: false })).toBe(
			false,
		);
	});

	it("requires owner or admin in a smart album even with a move grant", () => {
		expect(canMovePhotoFrom("unsorted", photo(2, true), { id: 3, isAdmin: false })).toBe(false);
		expect(canMovePhotoFrom("recent", photo(2, true), { id: 2, isAdmin: false })).toBe(true);
		expect(canMovePhotoFrom("timeline", photo(2, false), { id: 3, isAdmin: true })).toBe(true);
		expect(canMovePhotoFrom("timeline", photo(2, true), null)).toBe(false);
	});
});
