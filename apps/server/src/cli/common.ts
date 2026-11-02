import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { type User, users } from "../db/schema.ts";

export class CliError extends Error {}

export const out = (line: string) => process.stdout.write(`${line}\n`);

/** Resolve --owner (numeric id or username); defaults to the first admin. Throws a helpful CliError. */
export async function resolveOwner(db: Db, spec: string | undefined): Promise<User> {
	const known = async () => {
		const rows = await db
			.select({ id: users.id, username: users.username })
			.from(users)
			.orderBy(asc(users.id));
		return rows.length
			? `Known users: ${rows.map((u) => `${u.username} (${u.id})`).join(", ")}`
			: "There are no users yet: users are created on their first login, so sign in once via the web UI.";
	};
	if (spec) {
		const byId = /^\d+$/.test(spec) ? eq(users.id, Number(spec)) : eq(users.username, spec);
		const [u] = await db.select().from(users).where(byId);
		if (!u) throw new CliError(`No user "${spec}". ${await known()}`);
		return u;
	}
	const [admin] = await db
		.select()
		.from(users)
		.where(eq(users.isAdmin, true))
		.orderBy(asc(users.id))
		.limit(1);
	if (!admin) throw new CliError(`No --owner given and no admin user exists. ${await known()}`);
	return admin;
}
