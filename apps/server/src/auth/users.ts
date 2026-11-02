import type { UserAdmin, UserMe, UserPublic } from "@longan/shared";
import { sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { type User, users } from "../db/schema.ts";
import type { Viewer } from "../policy/index.ts";
import type { MappedClaims } from "./claims.ts";
import type { Session } from "./session.ts";

/** Insert or refresh the user identified by `sub` from token claims (every login / bearer request). */
export async function upsertUserFromClaims(db: Db, claims: MappedClaims): Promise<User> {
	const values = {
		sub: claims.sub,
		username: claims.username,
		displayName: claims.displayName,
		email: claims.email,
		roles: claims.roles,
		groups: claims.groups,
		isAdmin: claims.isAdmin,
		mayUpload: claims.mayUpload,
		lastLoginAt: sql`now()`,
	};
	const [row] = await db
		.insert(users)
		.values(values)
		.onConflictDoUpdate({ target: users.sub, set: { ...values, updatedAt: sql`now()` } })
		.returning();
	if (!row) throw new Error("user upsert returned no row");
	return row;
}

export type DirectoryUser = { sub: string; username: string; displayName: string; email: string | null };

/**
 * Pre-provision a user found in the directory so it can be a share target before first login.
 * New rows get no roles and no privileges; existing rows only get their profile fields refreshed.
 */
export async function provisionDirectoryUser(db: Db, u: DirectoryUser): Promise<User> {
	const [row] = await db
		.insert(users)
		.values({ ...u, roles: [], groups: [], isAdmin: false, mayUpload: false })
		.onConflictDoUpdate({
			target: users.sub,
			set: { username: u.username, displayName: u.displayName, email: u.email, updatedAt: sql`now()` },
		})
		.returning();
	if (!row) throw new Error("user provision returned no row");
	return row;
}

export function viewerFor(user: User, session: Pick<Session, "unlockedAlbumIds"> | null): Viewer {
	return {
		userId: user.id,
		isAdmin: user.isAdmin,
		mayUpload: user.isAdmin || user.mayUpload,
		unlockedAlbumIds: session?.unlockedAlbumIds ?? [],
	};
}

/** Postgres timestamptz text -> ISO-8601. */
export const toIso = (s: string) => new Date(s).toISOString();

export const toUserPublic = (u: User): UserPublic => ({
	id: u.id,
	username: u.username,
	displayName: u.displayName,
});

export const toUserMe = (u: User): UserMe => ({
	...toUserPublic(u),
	email: u.email,
	isAdmin: u.isAdmin,
	mayUpload: u.isAdmin || u.mayUpload,
	groups: u.groups,
});

export const toUserAdmin = (u: User): UserAdmin => ({
	...toUserMe(u),
	sub: u.sub,
	roles: u.roles,
	createdAt: toIso(u.createdAt),
	lastLoginAt: u.lastLoginAt === null ? null : toIso(u.lastLoginAt),
});
