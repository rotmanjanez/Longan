import { describe, expect, it } from "vitest";
import { loginUrl } from "./errors.ts";

describe("loginUrl", () => {
	it("sends an absolute redirect on the current origin", () => {
		const url = new URL(loginUrl("/gallery/abc?x=1"), window.location.origin);
		expect(url.pathname).toBe("/auth/login");
		expect(url.searchParams.get("redirect")).toBe(`${window.location.origin}/gallery/abc?x=1`);
	});
	it("does not prefix protocol-relative or absolute targets", () => {
		expect(new URL(loginUrl("//evil"), "http://x").searchParams.get("redirect")).toBe("//evil");
		expect(new URL(loginUrl("http://a/b"), "http://x").searchParams.get("redirect")).toBe("http://a/b");
	});
});
