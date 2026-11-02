import { describe, expect, it } from "vitest";
import { audienceOk, type ClaimMappingOptions, extractRoles, mapClaims } from "./claims.ts";

const opts: ClaimMappingOptions = {
	clientId: "longan",
	adminRole: "longan-admin",
	uploadRole: "longan-upload",
	groupsClaim: "groups",
};

describe("extractRoles", () => {
	it("merges realm and client roles, ignoring other clients", () => {
		const roles = extractRoles(
			{
				realm_access: { roles: ["offline_access", "longan-upload"] },
				resource_access: {
					longan: { roles: ["longan-admin", "longan-upload"] },
					account: { roles: ["manage-account"] },
				},
			},
			"longan",
		);
		expect(roles).toEqual(["offline_access", "longan-upload", "longan-admin"]);
	});

	it("tolerates missing or malformed containers", () => {
		expect(extractRoles({}, "longan")).toEqual([]);
		expect(
			extractRoles({ realm_access: "x", resource_access: { longan: { roles: [1, "a"] } } }, "longan"),
		).toEqual(["a"]);
	});
});

describe("mapClaims", () => {
	it("maps a Keycloak token with realm upload role and groups", () => {
		const m = mapClaims(
			{
				sub: "u-1",
				preferred_username: "alice",
				name: "Alice Liddell",
				email: "alice@longan.test",
				realm_access: { roles: ["default-roles-longan", "longan-upload"] },
				groups: ["/family", "/family"],
			},
			opts,
		);
		expect(m).toEqual({
			sub: "u-1",
			username: "alice",
			displayName: "Alice Liddell",
			email: "alice@longan.test",
			roles: ["default-roles-longan", "longan-upload"],
			groups: ["/family"],
			isAdmin: false,
			mayUpload: true,
		});
	});

	it("grants admin from a client role and admin implies upload", () => {
		const m = mapClaims({ sub: "u-2", resource_access: { longan: { roles: ["longan-admin"] } } }, opts);
		expect(m.isAdmin).toBe(true);
		expect(m.mayUpload).toBe(true);
	});

	it("gives no privileges without roles", () => {
		const m = mapClaims({ sub: "u-3", preferred_username: "bob", groups: ["/friends"] }, opts);
		expect(m.isAdmin).toBe(false);
		expect(m.mayUpload).toBe(false);
		expect(m.groups).toEqual(["/friends"]);
	});

	it("uses the configured groups claim and accepts a single string", () => {
		const m = mapClaims({ sub: "u-4", member_of: "/team" }, { ...opts, groupsClaim: "member_of" });
		expect(m.groups).toEqual(["/team"]);
	});

	it("falls back for username and display name", () => {
		expect(
			mapClaims({ sub: "s", given_name: "Ada", family_name: "Lovelace", email: "a@x" }, opts),
		).toMatchObject({
			username: "a@x",
			displayName: "Ada Lovelace",
		});
		expect(mapClaims({ sub: "s" }, opts)).toMatchObject({ username: "s", displayName: "s", email: null });
	});

	it("rejects tokens without sub", () => {
		expect(() => mapClaims({ preferred_username: "x" }, opts)).toThrow(/sub/);
	});
});

describe("audienceOk", () => {
	it("accepts aud or azp matching the client", () => {
		expect(audienceOk({ aud: "longan" }, "longan")).toBe(true);
		expect(audienceOk({ aud: ["account", "longan"] }, "longan")).toBe(true);
		expect(audienceOk({ aud: "account", azp: "longan" }, "longan")).toBe(true);
		expect(audienceOk({ azp: "longan" }, "longan")).toBe(true);
	});
	it("rejects tokens for other clients", () => {
		expect(audienceOk({ aud: "account", azp: "other" }, "longan")).toBe(false);
		expect(audienceOk({}, "longan")).toBe(false);
	});
});
