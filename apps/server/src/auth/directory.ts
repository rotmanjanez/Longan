import { env } from "../env.ts";
import { log } from "../lib/log.ts";
import { serviceAccountToken } from "./oidc.ts";
import type { DirectoryUser } from "./users.ts";

/**
 * Keycloak Admin REST API as a user directory (KEYCLOAK_ADMIN_URL). The OIDC client's service account needs
 * the `realm-management` / `view-users` client role. Any failure yields [] so the picker still shows local users.
 */

let token: { value: string; until: number } | null = null;
let warnedUnconfigured = false;
/** Errors are logged once until the next successful search, so a broken setup does not flood the log. */
let errorLogged = false;

export const directoryEnabled = () => Boolean(env.KEYCLOAK_ADMIN_URL);

/** Realm name = last path segment of the issuer (`.../realms/<realm>`). */
export function realmFromIssuer(issuer: string): string {
	const parts = new URL(issuer).pathname.split("/").filter(Boolean);
	return decodeURIComponent(parts[parts.length - 1] ?? "");
}

type KeycloakUser = {
	id: string;
	username: string;
	firstName?: string;
	lastName?: string;
	email?: string;
	enabled?: boolean;
	serviceAccountClientId?: string;
};

export function mapKeycloakUser(u: KeycloakUser): DirectoryUser {
	const name = [u.firstName, u.lastName].filter((s) => s && s.trim() !== "").join(" ");
	return { sub: u.id, username: u.username, displayName: name || u.username, email: u.email || null };
}

async function accessToken(): Promise<string> {
	if (token && token.until > Date.now()) return token.value;
	const t = await serviceAccountToken();
	// Refresh 30 s before expiry.
	token = { value: t.accessToken, until: Date.now() + Math.max(0, t.expiresIn - 30) * 1000 };
	return t.accessToken;
}

export async function searchDirectory(term: string): Promise<DirectoryUser[]> {
	if (!env.KEYCLOAK_ADMIN_URL) {
		if (!warnedUnconfigured) {
			warnedUnconfigured = true;
			log.info("KEYCLOAK_ADMIN_URL not set; user search uses local users only");
		}
		return [];
	}
	try {
		const realm = realmFromIssuer(env.OIDC_ISSUER);
		const url = new URL(
			`admin/realms/${encodeURIComponent(realm)}/users`,
			`${env.KEYCLOAK_ADMIN_URL.replace(/\/+$/, "")}/`,
		);
		url.searchParams.set("search", term);
		url.searchParams.set("max", "20");
		url.searchParams.set("briefRepresentation", "true");
		const res = await fetch(url, {
			headers: { authorization: `Bearer ${await accessToken()}`, accept: "application/json" },
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) {
			if (res.status === 401) token = null;
			throw new Error(`directory search HTTP ${res.status}`);
		}
		const list = (await res.json()) as KeycloakUser[];
		errorLogged = false;
		return list
			.filter(
				(u) => u.enabled !== false && !u.serviceAccountClientId && !u.username.startsWith("service-account-"),
			)
			.map(mapKeycloakUser);
	} catch (err) {
		if (!errorLogged) {
			errorLogged = true;
			log.warn("keycloak directory search failed (further errors suppressed)", { err: String(err) });
		}
		return [];
	}
}
