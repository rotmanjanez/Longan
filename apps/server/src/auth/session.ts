import { eq, lt, sql } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, setSignedCookie } from "hono/cookie";
import { parseSigned, serializeSigned } from "hono/utils/cookie";
import type { Db } from "../db/index.ts";
import { sessions, type User, users } from "../db/schema.ts";
import { env } from "../env.ts";
import { newSessionId } from "../lib/ids.ts";
import { log } from "../lib/log.ts";
import { isHttpsApp } from "./oidc.ts";

export const SESSION_COOKIE = "longan_session";

export type Session = typeof sessions.$inferSelect;

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
let lastSweep = 0;

/** Delete expired sessions at most once per hour; piggybacks on session creation. Never throws. */
async function sweepExpired(db: Db) {
	const now = Date.now();
	if (now - lastSweep < SWEEP_INTERVAL_MS) return;
	lastSweep = now;
	try {
		await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
	} catch (err) {
		log.warn("session sweep failed", { err: String(err) });
	}
}

/** `userId` null creates an anonymous session (used to remember unlocked password albums for guests). */
export async function createSession(db: Db, userId: number | null, idToken: string | null): Promise<Session> {
	void sweepExpired(db);
	const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000).toISOString();
	const [row] = await db
		.insert(sessions)
		.values({ id: newSessionId(), userId, idToken, expiresAt })
		.returning();
	if (!row) throw new Error("session insert returned no row");
	return row;
}

/** Load a live session with its user (null for anonymous sessions). Expired sessions are deleted and yield null. */
export async function loadSession(
	db: Db,
	id: string,
): Promise<{ session: Session; user: User | null } | null> {
	const [row] = await db
		.select({ session: sessions, user: users, expired: sql<boolean>`${sessions.expiresAt} < now()` })
		.from(sessions)
		.leftJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.limit(1);
	if (!row) return null;
	if (row.expired) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	return { session: row.session, user: row.user };
}

export async function deleteSession(db: Db, id: string): Promise<Session | null> {
	const [row] = await db.delete(sessions).where(eq(sessions.id, id)).returning();
	return row ?? null;
}

/** Append album ids to the session's unlocked list (de-duplicated). Used by `albums.unlock`. */
export async function unlockAlbums(db: Db, sessionId: string, albumIds: string[]): Promise<void> {
	if (albumIds.length === 0) return;
	await db
		.update(sessions)
		.set({
			unlockedAlbumIds: sql`(select coalesce(array_agg(distinct x), '{}') from unnest(${sessions.unlockedAlbumIds} || ${sql.param(albumIds)}::text[]) as x)`,
		})
		.where(eq(sessions.id, sessionId));
}

const cookieOptions = () =>
	({
		path: "/",
		httpOnly: true,
		sameSite: "Lax",
		secure: isHttpsApp(),
	}) as const;

export async function setSessionCookie(c: Context, session: Session) {
	await setSignedCookie(c, SESSION_COOKIE, session.id, env.SESSION_SECRET, {
		...cookieOptions(),
		expires: new Date(session.expiresAt),
	});
}

/** `Set-Cookie` header value for a session; for code paths without a Hono context (RPC procedures). */
export function sessionCookieHeader(session: Session): Promise<string> {
	return serializeSigned(SESSION_COOKIE, session.id, env.SESSION_SECRET, {
		...cookieOptions(),
		expires: new Date(session.expiresAt),
	});
}

export function clearSessionCookie(c: Context) {
	deleteCookie(c, SESSION_COOKIE, cookieOptions());
}

/**
 * Session id from the signed cookie of a raw request. Returns null when absent; throws only on malformed
 * input (callers log and treat as anonymous). A bad signature yields null.
 */
export async function readSessionId(req: Request): Promise<string | null> {
	const header = req.headers.get("cookie");
	if (!header?.includes(SESSION_COOKIE)) return null;
	const parsed = await parseSigned(header, env.SESSION_SECRET, SESSION_COOKIE);
	const value = parsed[SESSION_COOKIE];
	if (value === false) log.warn("session cookie with invalid signature ignored");
	return typeof value === "string" && value !== "" ? value : null;
}
