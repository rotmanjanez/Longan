import { createHash } from "node:crypto";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import type { Db } from "../db/index.ts";
import { env } from "../env.ts";
import { audienceOk } from "./claims.ts";
import type { AuthState } from "./context.ts";
import { getOidcConfig, mapTokenClaims } from "./oidc.ts";
import { upsertUserFromClaims, viewerFor } from "./users.ts";

/**
 * `Authorization: Bearer <access token>` support for API clients and the CLI. Tokens are verified against the
 * issuer's JWKS. Audience: Keycloak access tokens usually carry `aud: "account"` (or none) and identify the
 * client in `azp`, so a token is accepted when `aud` contains OIDC_CLIENT_ID or `azp` equals it. Tokens of
 * other clients need an audience mapper adding OIDC_CLIENT_ID.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function getJwks() {
	if (!jwks) {
		const uri = (await getOidcConfig()).serverMetadata().jwks_uri;
		if (!uri) throw new Error("issuer metadata has no jwks_uri");
		jwks = createRemoteJWKSet(new URL(uri));
	}
	return jwks;
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
	const { payload } = await jwtVerify(token, await getJwks(), { issuer: env.OIDC_ISSUER });
	if (!audienceOk(payload as Record<string, unknown>, env.OIDC_CLIENT_ID))
		throw new Error("token audience/azp does not match client");
	// Keycloak marks token kinds; refuse ID/refresh tokens presented as bearer.
	if (payload.typ !== undefined && payload.typ !== "Bearer")
		throw new Error(`token typ ${String(payload.typ)}`);
	return payload;
}

/** Verified tokens are cached briefly so a burst of API calls costs one upsert. Keyed by token hash. */
const CACHE_MS = 60_000;
const MAX_CACHE = 500;
const cache = new Map<string, { state: AuthState; until: number }>();

export async function authenticateBearer(db: Db, token: string): Promise<AuthState> {
	const key = createHash("sha256").update(token).digest("base64url");
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && hit.until > now) return hit.state;
	if (hit) cache.delete(key);

	const payload = await verifyAccessToken(token);
	const user = await upsertUserFromClaims(db, mapTokenClaims(payload as Record<string, unknown>));
	const state: AuthState = { viewer: viewerFor(user, null), user, sessionId: null };
	const exp = typeof payload.exp === "number" ? payload.exp * 1000 : now + CACHE_MS;
	if (cache.size >= MAX_CACHE) cache.clear();
	cache.set(key, { state, until: Math.min(exp, now + CACHE_MS) });
	return state;
}
