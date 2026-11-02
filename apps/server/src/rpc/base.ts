import { contract } from "@longan/shared";
import { implement, ORPCError } from "@orpc/server";
import type { Ctx } from "./context.ts";

/** Implementer bound to the shared contract and the request context. Every procedure file starts from this. */
export const os = implement(contract).$context<Ctx>();

export const notImplemented = (name: string) => () => {
	throw new ORPCError("NOT_IMPLEMENTED", { message: `${name} is not implemented yet` });
};
