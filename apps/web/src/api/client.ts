import type { Contract } from "@longan/shared/contract";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient, InferContractRouterOutputs } from "@orpc/contract";

export type ApiClient = ContractRouterClient<Contract>;
export type ApiOutputs = InferContractRouterOutputs<Contract>;
export type InitData = ApiOutputs["init"]["get"];
export type RootAlbums = ApiOutputs["albums"]["root"];

const link = new RPCLink({
	url: () => new URL("/api/rpc", window.location.origin).toString(),
	fetch: (request, init) => fetch(request, { ...init, credentials: "include" }),
});

/** Typed oRPC client for every procedure in the shared contract (POST JSON to /api/rpc). */
export const client: ApiClient = createORPCClient(link);
