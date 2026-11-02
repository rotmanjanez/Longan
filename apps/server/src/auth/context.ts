import { db } from "../db/index.ts";
import type { User } from "../db/schema.ts";
import { log } from "../lib/log.ts";
import { GUEST, type Viewer } from "../policy/index.ts";
import { authenticateBearer } from "./bearer.ts";
import { loadSession, readSessionId } from "./session.ts";
import { viewerFor } from "./users.ts";

export type AuthState = { viewer: Viewer; user: User | null; sessionId: string | null };

const guest = (): AuthState => ({ viewer: GUEST, user: null, sessionId: null });

/**
 * Resolve the viewer for a request: signed session cookie first, then `Authorization: Bearer`, else guest.
 * Never throws; any failure is logged and the request continues anonymously.
 */
export async function resolveAuth(req: Request): Promise<AuthState> {
	try {
		const sid = await readSessionId(req);
		if (sid) {
			const loaded = await loadSession(db, sid);
			if (loaded) {
				return { viewer: viewerFor(loaded.user, loaded.session), user: loaded.user, sessionId: sid };
			}
		}
	} catch (err) {
		log.warn("session cookie rejected", { err: String(err) });
	}

	const authz = req.headers.get("authorization");
	const m = authz ? /^Bearer\s+(\S+)$/i.exec(authz) : null;
	if (m?.[1]) {
		try {
			return await authenticateBearer(db, m[1]);
		} catch (err) {
			log.warn("bearer token rejected", { err: String(err) });
		}
	}
	return guest();
}
