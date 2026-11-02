import { parseArgs } from "node:util";
import { SizeVariantType } from "@longan/shared";
import { asc } from "drizzle-orm";
import { db } from "../db/index.ts";
import { photos } from "../db/schema.ts";
import { reprocessPhoto } from "../media/pipeline.ts";
import { CliError, out } from "./common.ts";

export async function reprocess(args: string[]): Promise<number> {
	const { values } = parseArgs({
		args,
		options: { variants: { type: "string" }, photo: { type: "string" } },
	});
	let variants: SizeVariantType[] | undefined;
	if (values.variants) {
		variants = values.variants.split(",").map((v) => {
			const p = SizeVariantType.safeParse(v.trim());
			if (!p.success || p.data === "original") {
				throw new CliError(`invalid variant "${v}" (use medium2x, medium, small2x, small, thumb2x, thumb)`);
			}
			return p.data;
		});
	}
	const ids = values.photo
		? [values.photo]
		: (await db.select({ id: photos.id }).from(photos).orderBy(asc(photos.createdAt))).map((r) => r.id);
	let ok = 0;
	let failed = 0;
	for (const [i, id] of ids.entries()) {
		try {
			const n = await reprocessPhoto(db, id, variants);
			ok++;
			out(`[${i + 1}/${ids.length}] ${id}: ${n} variants`);
		} catch (err) {
			failed++;
			out(`[${i + 1}/${ids.length}] ${id}: FAILED ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	out(`done: ${ok} reprocessed, ${failed} failed`);
	return failed > 0 ? 2 : 0;
}
