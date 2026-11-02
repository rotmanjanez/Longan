import { describe, expect, it } from "vitest";
import { flattenTree, licenseKey, withDescendants } from "./options.ts";

const tree = {
	ids: ["c", "a", "b", "d"],
	titles: ["Child", "Alpha", "Beta", "Grandchild"],
	parentIds: [null, null, "a", "b"],
};

describe("album tree helpers", () => {
	it("flattens depth-first in title order", () => {
		expect(flattenTree(tree).map((r) => `${r.depth}:${r.title}`)).toEqual([
			"0:Alpha",
			"1:Beta",
			"2:Grandchild",
			"0:Child",
		]);
	});
	it("collects descendants", () => {
		expect([...withDescendants(tree, ["a"])].sort()).toEqual(["a", "b", "d"]);
	});
});

describe("licenseKey", () => {
	it("maps license ids to dot-free i18n keys", () => {
		expect(licenseKey("CC-BY-4.0")).toBe("licenses.CC-BY-4_0");
		expect(licenseKey("reserved")).toBe("licenses.reserved");
	});
});
