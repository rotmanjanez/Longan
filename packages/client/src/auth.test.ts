import { afterEach, describe, expect, it, vi } from "vitest";
import { clientCredentials, LonganAuthError } from "./auth.ts";

const ISSUER = "https://sso.example.com/realms/longan";
const TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`;

function idp(opts: { expiresIn?: number; fail?: Response } = {}) {
	const requests: { url: string; body: URLSearchParams | null }[] = [];
	let issued = 0;
	const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		requests.push({ url, body: init?.body ? new URLSearchParams(String(init.body)) : null });
		if (url === `${ISSUER}/.well-known/openid-configuration`) {
			return Response.json({ issuer: ISSUER, token_endpoint: TOKEN_ENDPOINT });
		}
		if (url === TOKEN_ENDPOINT) {
			if (opts.fail) return opts.fail;
			issued++;
			return Response.json({ access_token: `token-${issued}`, expires_in: opts.expiresIn ?? 300 });
		}
		return new Response("not found", { status: 404 });
	};
	return { fetch: fetchImpl as typeof fetch, requests };
}

afterEach(() => {
	vi.useRealTimers();
});

describe("clientCredentials", () => {
	it("discovers the token endpoint, sends the client credentials and caches the token", async () => {
		const server = idp();
		const token = clientCredentials({
			issuer: `${ISSUER}/`,
			clientId: "photobox",
			clientSecret: "s3cret",
			scope: "openid",
			fetch: server.fetch,
		});
		const [a, b] = await Promise.all([token(), token()]);
		expect([a, b]).toEqual(["token-1", "token-1"]);
		await expect(token()).resolves.toBe("token-1");
		expect(server.requests.map((r) => r.url)).toEqual([
			`${ISSUER}/.well-known/openid-configuration`,
			TOKEN_ENDPOINT,
		]);
		expect(Object.fromEntries(server.requests[1]!.body!)).toEqual({
			grant_type: "client_credentials",
			client_id: "photobox",
			client_secret: "s3cret",
			scope: "openid",
		});
	});

	it("refreshes shortly before expiry and after invalidate()", async () => {
		vi.useFakeTimers({ now: 0 });
		const server = idp({ expiresIn: 60 });
		const token = clientCredentials({
			issuer: ISSUER,
			clientId: "c",
			clientSecret: "s",
			fetch: server.fetch,
		});
		await expect(token()).resolves.toBe("token-1");
		vi.setSystemTime(29_000);
		await expect(token()).resolves.toBe("token-1");
		vi.setSystemTime(31_000); // 60 s lifetime minus the default 30 s leeway
		await expect(token()).resolves.toBe("token-2");
		token.invalidate();
		await expect(token()).resolves.toBe("token-3");
		// Discovery happened once.
		expect(server.requests.filter((r) => r.url.endsWith("openid-configuration"))).toHaveLength(1);
	});

	it("reports identity-provider errors", async () => {
		const server = idp({
			fail: Response.json(
				{ error: "unauthorized_client", error_description: "Invalid client secret" },
				{ status: 401 },
			),
		});
		const token = clientCredentials({
			issuer: ISSUER,
			clientId: "c",
			clientSecret: "wrong",
			fetch: server.fetch,
		});
		const err = await token().catch((e: unknown) => e);
		expect(err).toBeInstanceOf(LonganAuthError);
		expect(err).toMatchObject({ status: 401 });
		expect(String(err)).toContain("unauthorized_client: Invalid client secret");
	});
});
