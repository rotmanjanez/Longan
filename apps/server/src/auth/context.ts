import type { User } from "../db/schema.ts";
import { GUEST, type Viewer } from "../policy/index.ts";

export type AuthState = { viewer: Viewer; user: User | null; sessionId: string | null };

/**
 * Resolve the viewer for a request from the session cookie or a Bearer token.
 * STUB: replaced by the auth implementation (src/auth/*). Must never throw for anonymous requests.
 */
export async function resolveAuth(_req: Request): Promise<AuthState> {
	return { viewer: GUEST, user: null, sessionId: null };
}
