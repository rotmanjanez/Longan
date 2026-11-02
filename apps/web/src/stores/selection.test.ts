import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSelectionStore } from "./selection.ts";

const ids = ["a", "b", "c", "d", "e"];
const none = { mod: false, shift: false };
const mod = { mod: true, shift: false };
const shift = { mod: false, shift: true };

describe("selection store", () => {
	beforeEach(() => setActivePinia(createPinia()));

	it("does not consume plain clicks (the caller opens the item)", () => {
		const s = useSelectionStore();
		expect(s.clickPhoto("a", ids, none)).toBe(false);
		expect(s.photoIds).toEqual([]);
	});

	it("toggles with ctrl/cmd", () => {
		const s = useSelectionStore();
		expect(s.clickPhoto("b", ids, mod)).toBe(true);
		s.clickPhoto("d", ids, mod);
		expect(s.photoIds).toEqual(["b", "d"]);
		s.clickPhoto("b", ids, mod);
		expect(s.photoIds).toEqual(["d"]);
		expect(s.photoSet.has("d")).toBe(true);
	});

	it("selects a range with shift from the last clicked item", () => {
		const s = useSelectionStore();
		s.clickPhoto("b", ids, mod);
		s.clickPhoto("d", ids, shift);
		expect(s.photoIds).toEqual(["b", "c", "d"]);
		// Range backwards, added to the existing selection.
		s.clickPhoto("a", ids, shift);
		expect(s.photoIds).toEqual(["a", "b", "c", "d"]);
	});

	it("shift on an already selected item removes the range", () => {
		const s = useSelectionStore();
		s.selectAll(ids);
		s.clickPhoto("b", ids, mod); // deselect b, anchor b
		s.clickPhoto("d", ids, shift); // d is selected -> remove b..d
		expect(s.photoIds).toEqual(["a", "e"]);
	});

	it("shift without a selection selects just the item", () => {
		const s = useSelectionStore();
		s.clickPhoto("c", ids, shift);
		expect(s.photoIds).toEqual(["c"]);
	});

	it("keeps photo and album selections exclusive", () => {
		const s = useSelectionStore();
		s.clickAlbum("x", ["x", "y"], mod);
		expect(s.albumIds).toEqual(["x"]);
		s.clickPhoto("a", ids, mod);
		expect(s.albumIds).toEqual([]);
		expect(s.photoIds).toEqual(["a"]);
		s.clickAlbum("y", ["x", "y"], mod);
		expect(s.photoIds).toEqual([]);
		expect(s.count).toBe(1);
	});

	it("select all, rubber band set, prune and clear", () => {
		const s = useSelectionStore();
		s.selectAll(ids, ["x"]);
		expect(s.count).toBe(6);
		expect(s.hasSelection).toBe(true);
		s.setPhotos(["a", "a", "c"]);
		expect(s.photoIds).toEqual(["a", "c"]);
		expect(s.albumIds).toEqual([]);
		s.prune(["c"], []);
		expect(s.photoIds).toEqual(["c"]);
		s.clear();
		expect(s.hasSelection).toBe(false);
	});
});
