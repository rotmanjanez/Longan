/**
 * Pure mapping from OIDC token claims (Keycloak) to Longan's user fields. No env or DB access so it can be
 * unit-tested directly; `oidc.ts` binds it to the configured role/claim names.
 */

export type ClaimMappingOptions = {
	clientId: string;
	adminRole: string;
	uploadRole: string;
	groupsClaim: string;
};

export type MappedClaims = {
	sub: string;
	username: string;
	displayName: string;
	email: string | null;
	roles: string[];
	groups: string[];
	isAdmin: boolean;
	mayUpload: boolean;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function strArray(v: unknown): string[] {
	if (typeof v === "string") return v.trim() === "" ? [] : [v.trim()];
	if (!Array.isArray(v)) return [];
	return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

function rolesOf(container: unknown): string[] {
	if (!container || typeof container !== "object") return [];
	return strArray((container as { roles?: unknown }).roles);
}

/** Roles from `realm_access.roles` plus `resource_access[clientId].roles`, de-duplicated, order preserved. */
export function extractRoles(claims: Record<string, unknown>, clientId: string): string[] {
	const realm = rolesOf(claims.realm_access);
	const ra = claims.resource_access;
	const client = ra && typeof ra === "object" ? rolesOf((ra as Record<string, unknown>)[clientId]) : [];
	return [...new Set([...realm, ...client])];
}

export function mapClaims(claims: Record<string, unknown>, opts: ClaimMappingOptions): MappedClaims {
	const sub = str(claims.sub);
	if (!sub) throw new Error("token has no sub claim");
	const email = str(claims.email);
	const username = str(claims.preferred_username) ?? email ?? sub;
	const fullName = [str(claims.given_name), str(claims.family_name)].filter(Boolean).join(" ");
	const displayName = str(claims.name) ?? (fullName || username);
	const roles = extractRoles(claims, opts.clientId);
	const groups = [...new Set(strArray(claims[opts.groupsClaim]))];
	const isAdmin = roles.includes(opts.adminRole);
	const mayUpload = isAdmin || roles.includes(opts.uploadRole);
	return { sub, username, displayName, email, roles, groups, isAdmin, mayUpload };
}

/** Accept a token meant for this client: `aud` contains the client id, or `azp` (authorized party) is the client. */
export function audienceOk(claims: Record<string, unknown>, clientId: string): boolean {
	return strArray(claims.aud).includes(clientId) || claims.azp === clientId;
}
