import { ORPCError } from "@orpc/server";
import type { Db } from "../db/index.ts";
import type { User } from "../db/schema.ts";
import type { Viewer } from "../policy/index.ts";

/** Per-request context; built in app.ts from the auth middleware. */
export type Ctx = {
	db: Db;
	viewer: Viewer;
	user: User | null;
	sessionId: string | null;
	requestUrl: URL;
	/** Headers appended to the HTTP response (e.g. Set-Cookie for anonymous unlock sessions). */
	resHeaders: Headers;
};

export function requireUser(ctx: Ctx): User {
	if (!ctx.user) throw new ORPCError("UNAUTHORIZED");
	return ctx.user;
}

export function requireAdmin(ctx: Ctx): User {
	const u = requireUser(ctx);
	if (!ctx.viewer.isAdmin) throw new ORPCError("FORBIDDEN");
	return u;
}

export function requireUpload(ctx: Ctx): User {
	const u = requireUser(ctx);
	if (!ctx.viewer.mayUpload) throw new ORPCError("FORBIDDEN");
	return u;
}
