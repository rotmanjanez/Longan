/**
 * Integration: password grant for the dev realm user `alice`, then resolveAuth() with that Bearer token against
 * the dev database. Skipped unless Keycloak (KEYCLOAK_URL, default http://localhost:8080) and DATABASE_URL are
 * available. Loads apps/server/.env when present.
 */
import { afterAll, describe, expect, it } from "vitest";

try {
	process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
} catch {
	// no .env: rely on the environment
}

const KEYCLOAK_URL = (process.env.KEYCLOAK_URL ?? "http://localhost:8080").replace(/\/+$/, "");
const REALM = "longan";

async function reachable(): Promise<boolean> {
	if (!process.env.DATABASE_URL || !process.env.OIDC_ISSUER || !process.env.SESSION_SECRET) return false;
	try {
		const r = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/.well-known/openid-configuration`, {
			signal: AbortSignal.timeout(2000),
		});
		return r.ok;
	} catch {
		return false;
	}
}

const enabled = await reachable();

describe.skipIf(!enabled)("bearer auth against dev Keycloak", () => {
	let createdUserId: number | null = null;
	let existedBefore = true;

	afterAll(async () => {
		if (!enabled) return;
		const { db } = await import("../db/index.ts");
		const { users } = await import("../db/schema.ts");
		const { eq } = await import("drizzle-orm");
		if (createdUserId !== null && !existedBefore) await db.delete(users).where(eq(users.id, createdUserId));
	});

	it("resolves alice from a password-grant access token", async () => {
		const { db } = await import("../db/index.ts");
		const { users } = await import("../db/schema.ts");
		const { eq } = await import("drizzle-orm");
		const { resolveAuth } = await import("./context.ts");

		const res = await fetch(`${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`, {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "password",
				client_id: process.env.OIDC_CLIENT_ID ?? "longan",
				client_secret: process.env.OIDC_CLIENT_SECRET ?? "longan-dev-secret",
				username: "alice",
				password: "alice",
				scope: "openid",
			}),
		});
		expect(res.ok).toBe(true);
		const { access_token } = (await res.json()) as { access_token: string };
		const sub = JSON.parse(Buffer.from(access_token.split(".")[1] ?? "", "base64url").toString())
			.sub as string;
		existedBefore = (await db.select({ id: users.id }).from(users).where(eq(users.sub, sub))).length > 0;

		const auth = await resolveAuth(
			new Request("http://localhost/api/rpc/init/get", {
				headers: { authorization: `Bearer ${access_token}` },
			}),
		);
		expect(auth.user).not.toBeNull();
		createdUserId = auth.user?.id ?? null;
		expect(auth.sessionId).toBeNull();
		expect(auth.viewer.mayUpload).toBe(true);
		expect(auth.viewer.isAdmin).toBe(false);

		const [row] = await db.select().from(users).where(eq(users.sub, sub));
		expect(row?.username).toBe("alice");
		expect(row?.groups).toContain("/family");
		expect(row?.roles).toContain("longan-upload");
	});

	it("falls back to guest for a garbage token and a forged cookie", async () => {
		const { resolveAuth } = await import("./context.ts");
		const auth = await resolveAuth(
			new Request("http://localhost/", {
				headers: { authorization: "Bearer not.a.jwt", cookie: "longan_session=abc.def" },
			}),
		);
		expect(auth.user).toBeNull();
		expect(auth.viewer.userId).toBeNull();
	});
});
