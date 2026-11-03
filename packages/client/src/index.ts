// The shared sources are imported by relative path so tsc emits them into dist next to the client (they are
// private to the monorepo and not published on their own).

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type {
	ContractRouterClient,
	InferContractRouterInputs,
	InferContractRouterOutputs,
} from "@orpc/contract";
import type { contract } from "../../shared/src/contract/index.ts";
import { resolveToken, type TokenSource } from "./auth.ts";
import {
	LonganUploadError,
	parseUploadResponse,
	type UploadBody,
	type UploadOptions,
	type UploadResult,
	uploadQuery,
} from "./upload.ts";

export { ORPCError } from "@orpc/client";
// The API contract, its resource schemas (zod) and enums, bundled from the Longan monorepo.
export * from "../../shared/src/index.ts";
export * from "./auth.ts";
export * from "./upload.ts";

type Contract = typeof contract;

/** Typed client for every RPC procedure, e.g. `rpc.albums.create({ title })`. */
export type LonganRpc = ContractRouterClient<Contract>;
export type LonganInputs = InferContractRouterInputs<Contract>;
export type LonganOutputs = InferContractRouterOutputs<Contract>;

export type LonganClientOptions = {
	/** Public base URL of the Longan instance (its APP_URL), e.g. `https://photos.example.com`. */
	url: string | URL;
	/** Bearer token or token source, e.g. `clientCredentials({...})`. Omit to call as a guest (or with cookies). */
	token?: TokenSource;
	/** Extra headers sent with every request. */
	headers?: Record<string, string>;
	/** Fetch credentials mode. Use `"include"` in a browser to send the Longan session cookie cross-origin. */
	credentials?: RequestCredentials;
	/** Custom fetch implementation (defaults to the global `fetch`). */
	fetch?: typeof globalThis.fetch;
};

export type LonganClient = {
	/** The instance base URL, normalised to end with `/`. */
	readonly url: URL;
	/** Typed RPC procedures (`POST /api/rpc/*`). Errors are thrown as `ORPCError` with `code` and `status`. */
	readonly rpc: LonganRpc;
	/**
	 * Uploads one photo or video (`PUT /api/upload`, streamed raw body). Resolves to the new (or, for duplicates,
	 * existing) photo id; throws `LonganUploadError` on failure.
	 */
	upload(body: UploadBody, options?: UploadOptions): Promise<UploadResult>;
};

export function createLonganClient(options: LonganClientOptions): LonganClient {
	const base = new URL(options.url);
	if (!base.pathname.endsWith("/")) base.pathname += "/";
	const doFetch: typeof globalThis.fetch = (...args) => (options.fetch ?? globalThis.fetch)(...args);

	async function headers(): Promise<Record<string, string>> {
		const h: Record<string, string> = { ...options.headers };
		const token = await resolveToken(options.token);
		if (token) h.authorization = `Bearer ${token}`;
		return h;
	}

	const link = new RPCLink({
		url: new URL("api/rpc", base).toString(),
		headers,
		fetch: (request, init) =>
			doFetch(request, options.credentials ? { ...init, credentials: options.credentials } : init),
	});
	const rpc: LonganRpc = createORPCClient(link);

	async function upload(body: UploadBody, uploadOptions: UploadOptions = {}): Promise<UploadResult> {
		const url = new URL(`api/upload?${uploadQuery(body, uploadOptions)}`, base);
		const init: RequestInit & { duplex?: "half" } = {
			method: "PUT",
			headers: { "content-type": "application/octet-stream", ...(await headers()) },
			body: body as BodyInit,
			signal: uploadOptions.signal,
		};
		if (options.credentials) init.credentials = options.credentials;
		// Streamed request bodies need half-duplex mode (Node's fetch and browsers that support it).
		if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) init.duplex = "half";
		let res: Response;
		try {
			res = await doFetch(url, init);
		} catch (err) {
			if (uploadOptions.signal?.aborted) throw err;
			throw new LonganUploadError(
				`upload failed: ${err instanceof Error ? err.message : String(err)}`,
				0,
				"NETWORK",
			);
		}
		return parseUploadResponse(res);
	}

	return { url: base, rpc, upload };
}
