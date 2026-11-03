/**
 * Where the client gets its bearer token from: a fixed access token, or a function that is called before every
 * request (return a cached token; `clientCredentials()` does this for you). Return nothing to call as a guest.
 */
export type TokenSource = string | (() => string | null | undefined | Promise<string | null | undefined>);

export async function resolveToken(source: TokenSource | undefined): Promise<string | null> {
	if (source === undefined) return null;
	const token = typeof source === "string" ? source : await source();
	return token || null;
}

export class LonganAuthError extends Error {
	override name = "LonganAuthError";
	/** HTTP status of the failing identity-provider response, if there was one. */
	readonly status: number | undefined;
	constructor(message: string, status?: number) {
		super(message);
		this.status = status;
	}
}

export type ClientCredentialsOptions = {
	/** OIDC issuer, the same value as Longan's OIDC_ISSUER, e.g. `https://sso.example.com/realms/longan`. */
	issuer: string;
	clientId: string;
	clientSecret: string;
	/** Space-separated scopes to request (optional). */
	scope?: string;
	/** Refresh this many seconds before the token expires. Default 30. */
	leewaySeconds?: number;
	fetch?: typeof globalThis.fetch;
};

/** A token source that also lets you drop the cached token (e.g. after a 401). */
export type CachedTokenSource = (() => Promise<string>) & { invalidate(): void };

/**
 * OAuth 2.0 client-credentials token source for a Keycloak service account (or any OIDC provider). The token
 * endpoint is discovered from `${issuer}/.well-known/openid-configuration`. Tokens are cached until shortly before
 * they expire, and concurrent callers share one request.
 *
 * In Keycloak the client needs "Service accounts" enabled, the `longan-upload` role (to upload), and an Audience
 * mapper adding Longan's client id: Longan only accepts tokens whose `aud` contains its client id or whose
 * `azp` is its client id.
 */
export function clientCredentials(options: ClientCredentialsOptions): CachedTokenSource {
	const doFetch: typeof globalThis.fetch = (...args) => (options.fetch ?? globalThis.fetch)(...args);
	const leewayMs = (options.leewaySeconds ?? 30) * 1000;
	let endpoint: Promise<string> | null = null;
	let cached: { value: string; until: number } | null = null;
	let inflight: Promise<string> | null = null;

	async function discover(): Promise<string> {
		const url = `${options.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
		const res = await doFetch(url, { headers: { accept: "application/json" } });
		if (!res.ok)
			throw new LonganAuthError(`OIDC discovery failed: HTTP ${res.status} from ${url}`, res.status);
		const meta = (await res.json()) as { token_endpoint?: unknown };
		if (typeof meta.token_endpoint !== "string") {
			throw new LonganAuthError(`OIDC discovery document at ${url} has no token_endpoint`);
		}
		return meta.token_endpoint;
	}

	async function fetchToken(): Promise<string> {
		endpoint ??= discover().catch((err: unknown) => {
			endpoint = null;
			throw err;
		});
		const body = new URLSearchParams({
			grant_type: "client_credentials",
			client_id: options.clientId,
			client_secret: options.clientSecret,
		});
		if (options.scope) body.set("scope", options.scope);
		const res = await doFetch(await endpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
			body,
		});
		const json = (await res.json().catch(() => ({}))) as {
			access_token?: unknown;
			expires_in?: unknown;
			error?: unknown;
			error_description?: unknown;
		};
		if (!res.ok || typeof json.access_token !== "string") {
			const detail = [json.error, json.error_description].filter((s) => typeof s === "string").join(": ");
			throw new LonganAuthError(
				`token request failed: HTTP ${res.status}${detail ? ` (${detail})` : ""}`,
				res.status,
			);
		}
		const expiresIn = typeof json.expires_in === "number" ? json.expires_in * 1000 : 60_000;
		cached = { value: json.access_token, until: Date.now() + Math.max(0, expiresIn - leewayMs) };
		return json.access_token;
	}

	const source = async () => {
		if (cached && cached.until > Date.now()) return cached.value;
		inflight ??= fetchToken().finally(() => {
			inflight = null;
		});
		return inflight;
	};
	return Object.assign(source, {
		invalidate() {
			cached = null;
		},
	});
}
