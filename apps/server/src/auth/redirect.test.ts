import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.DATABASE_URL ??= "postgres://longan:longan@localhost:5433/longan";
	process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
	process.env.OIDC_ISSUER ??= "http://localhost:8080/realms/longan";
	process.env.OIDC_CLIENT_ID ??= "longan";
});

import { safeRedirect } from "./routes.ts";

describe("safeRedirect", () => {
	const origins = ["http://localhost:3100", "http://localhost:5173"];
	it("keeps same-site paths and absolute URLs on allowed origins", () => {
		expect(safeRedirect("/gallery/x?y=1", origins)).toBe("/gallery/x?y=1");
		expect(safeRedirect("http://localhost:5173/gallery/x", origins)).toBe("http://localhost:5173/gallery/x");
		expect(safeRedirect("http://localhost:3100/", origins)).toBe("http://localhost:3100/");
	});
	it("rejects other origins and protocol-relative tricks", () => {
		expect(safeRedirect("https://evil.example/", origins)).toBe("/");
		expect(safeRedirect("//evil.example/", origins)).toBe("/");
		expect(safeRedirect("/\\evil.example", origins)).toBe("/");
		expect(safeRedirect("javascript:alert(1)", origins)).toBe("/");
		expect(safeRedirect(undefined, origins)).toBe("/");
	});
});
