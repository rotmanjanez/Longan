import { asc, ilike, or } from "drizzle-orm";
import { searchDirectory } from "../../auth/directory.ts";
import { provisionDirectoryUser, toUserAdmin, toUserPublic } from "../../auth/users.ts";
import { type User, users as usersTable } from "../../db/schema.ts";
import { log } from "../../lib/log.ts";
import { os } from "../base.ts";
import { requireAdmin, requireUser } from "../context.ts";

const LIMIT = 20;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export const users = os.users.router({
	search: os.users.search.handler(async ({ context: ctx, input }) => {
		requireUser(ctx);
		const term = input.term.trim();
		if (term === "") return [];
		const pattern = `%${escapeLike(term)}%`;
		const [local, directory] = await Promise.all([
			ctx.db
				.select()
				.from(usersTable)
				.where(
					or(
						ilike(usersTable.username, pattern),
						ilike(usersTable.displayName, pattern),
						ilike(usersTable.email, pattern),
					),
				)
				.orderBy(asc(usersTable.username))
				.limit(LIMIT),
			searchDirectory(term),
		]);

		const bySub = new Map<string, User>(local.map((u) => [u.sub, u]));
		// Directory hits are provisioned as local rows so callers always receive local ids (sharing.add needs them).
		for (const d of directory) {
			if (bySub.has(d.sub)) continue;
			try {
				bySub.set(d.sub, await provisionDirectoryUser(ctx.db, d));
			} catch (err) {
				log.warn("users.search: provisioning directory user failed", { sub: d.sub, err: String(err) });
			}
		}
		return [...bySub.values()].map(toUserPublic);
	}),

	list: os.users.list.handler(async ({ context: ctx }) => {
		requireAdmin(ctx);
		const rows = await ctx.db.select().from(usersTable).orderBy(asc(usersTable.username));
		return rows.map(toUserAdmin);
	}),
});
