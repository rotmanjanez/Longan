import { ORPCError } from "@orpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { settings as settingsTable } from "../../db/schema.ts";
import { invalidateSettings } from "../../settings/index.ts";
import { validateSettingValue } from "../../settings/validate.ts";
import { os } from "../base.ts";
import { requireAdmin } from "../context.ts";

export const settings = os.settings.router({
	list: os.settings.list.handler(async ({ context: ctx }) => {
		requireAdmin(ctx);
		const rows = await ctx.db
			.select()
			.from(settingsTable)
			.orderBy(asc(settingsTable.sort), asc(settingsTable.key));
		return rows.map((r) => ({
			key: r.key,
			value: r.value,
			type: r.type,
			category: r.category,
			description: r.description,
		}));
	}),

	update: os.settings.update.handler(async ({ context: ctx, input }) => {
		requireAdmin(ctx);
		const keys = [...new Set(input.entries.map((e) => e.key))];
		const rows = await ctx.db
			.select({ key: settingsTable.key, type: settingsTable.type })
			.from(settingsTable)
			.where(inArray(settingsTable.key, keys));
		const types = new Map(rows.map((r) => [r.key, r.type]));
		const updates: Array<{ key: string; value: string | null }> = [];
		for (const e of input.entries) {
			const type = types.get(e.key);
			if (type === undefined) throw new ORPCError("BAD_REQUEST", { message: `${e.key}: unknown setting` });
			const check = validateSettingValue(type, e.value);
			if (!check.ok) throw new ORPCError("BAD_REQUEST", { message: `${e.key}: ${check.reason}` });
			updates.push({ key: e.key, value: check.value });
		}
		await ctx.db.transaction(async (tx) => {
			for (const u of updates) {
				await tx.update(settingsTable).set({ value: u.value }).where(eq(settingsTable.key, u.key));
			}
		});
		invalidateSettings();
	}),
});
