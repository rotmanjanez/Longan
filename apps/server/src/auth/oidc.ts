import { decodeJwt } from "jose";
import * as client from "openid-client";
import { env } from "../env.ts";
import { log } from "../lib/log.ts";
import { type MappedClaims, mapClaims } from "./claims.ts";

/**
 * OIDC relying party (openid-client v6) against OIDC_ISSUER. The discovered Configuration is cached for the
 * process lifetime; a failed discovery is not cached so the next request retries.
 */

let configPromise: Promise<client.Configuration> | null = null;

export const CALLBACK_PATH = "/auth/callback";
export const redirectUri = () => new URL(CALLBACK_PATH, env.APP_URL).toString();
export const isHttpsApp = () => env.APP_URL.startsWith("https:");

export function getOidcConfig(): Promise<client.Configuration> {
	if (!configPromise) {
		const issuer = new URL(env.OIDC_ISSUER);
		const auth = env.OIDC_CLIENT_SECRET ? client.ClientSecretPost(env.OIDC_CLIENT_SECRET) : client.None();
		configPromise = client
			.discovery(issuer, env.OIDC_CLIENT_ID, undefined, auth, {
				execute: issuer.protocol === "http:" ? [client.allowInsecureRequests] : [],
				timeout: 10,
			})
			.catch((err: unknown) => {
				configPromise = null;
				log.error("oidc discovery failed", { issuer: env.OIDC_ISSUER, err: String(err) });
				throw err;
			});
	}
	return configPromise;
}

/** Map token claims with the configured client id, role names and groups claim. */
export function mapTokenClaims(claims: Record<string, unknown>): MappedClaims {
	return mapClaims(claims, {
		clientId: env.OIDC_CLIENT_ID,
		adminRole: env.OIDC_ADMIN_ROLE,
		uploadRole: env.OIDC_UPLOAD_ROLE,
		groupsClaim: env.OIDC_GROUPS_CLAIM,
	});
}

export type LoginStart = { url: URL; state: string; codeVerifier: string };

/** Build the authorization URL for an Authorization Code + PKCE (S256) login. */
export async function startLogin(): Promise<LoginStart> {
	const config = await getOidcConfig();
	const codeVerifier = client.randomPKCECodeVerifier();
	const state = client.randomState();
	const url = client.buildAuthorizationUrl(config, {
		redirect_uri: redirectUri(),
		scope: "openid profile email",
		code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
		code_challenge_method: "S256",
		state,
	});
	return { url, state, codeVerifier };
}

export type LoginResult = { claims: MappedClaims; idToken: string | null };

/**
 * Exchange the authorization code. `search` is the query string of the callback request; the URL is rebuilt on
 * APP_URL so the redirect_uri matches what was sent at login even behind a proxy.
 * Keycloak puts realm_access/resource_access only into the access token, so its claims are merged under the
 * (validated) ID token claims. The access token came straight from the token endpoint, so decoding is enough.
 */
export async function finishLogin(search: string, checks: { state: string; codeVerifier: string }) {
	const config = await getOidcConfig();
	const currentUrl = new URL(`${CALLBACK_PATH}${search}`, env.APP_URL);
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		pkceCodeVerifier: checks.codeVerifier,
		expectedState: checks.state,
		idTokenExpected: true,
	});
	const idClaims = (tokens.claims() ?? {}) as Record<string, unknown>;
	let accessClaims: Record<string, unknown> = {};
	try {
		accessClaims = decodeJwt(tokens.access_token) as Record<string, unknown>;
	} catch {
		// Opaque access token: roles must then come from the ID token mappers.
	}
	if (accessClaims.sub !== undefined && accessClaims.sub !== idClaims.sub) {
		throw new Error("access token and id token subjects differ");
	}
	const merged = { ...accessClaims, ...idClaims };
	for (const k of ["realm_access", "resource_access", env.OIDC_GROUPS_CLAIM]) {
		if (idClaims[k] === undefined && accessClaims[k] !== undefined) merged[k] = accessClaims[k];
	}
	return { claims: mapTokenClaims(merged), idToken: tokens.id_token ?? null } satisfies LoginResult;
}

/** RP-initiated logout URL, or null when the provider has no end_session_endpoint. */
export async function buildLogoutUrl(idToken: string | null): Promise<URL | null> {
	const config = await getOidcConfig();
	if (!config.serverMetadata().end_session_endpoint) return null;
	const params: Record<string, string> = {
		post_logout_redirect_uri: new URL("/", env.APP_URL).toString(),
		client_id: env.OIDC_CLIENT_ID,
	};
	if (idToken) params.id_token_hint = idToken;
	return client.buildEndSessionUrl(config, params);
}

/** Client-credentials grant for the client's own service account (used by the Keycloak directory). */
export async function serviceAccountToken(): Promise<{ accessToken: string; expiresIn: number }> {
	const config = await getOidcConfig();
	const res = await client.clientCredentialsGrant(config);
	return { accessToken: res.access_token, expiresIn: res.expiresIn() ?? 60 };
}
