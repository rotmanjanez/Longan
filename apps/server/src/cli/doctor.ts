import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { SIZE_VARIANT_TYPES } from "@longan/shared";
import { db } from "../db/index.ts";
import { sizeVariants } from "../db/schema.ts";
import { enqueueMany } from "../jobs/worker.ts";
import { photosWithoutVariants } from "../media/pipeline.ts";
import { absPath, relPath, storageRoot } from "../media/storage.ts";
import { out } from "./common.ts";

async function* filesUnder(dir: string): AsyncGenerator<string> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* filesUnder(p);
		else if (e.isFile()) yield p;
	}
}

export async function doctor(args: string[]): Promise<number> {
	const { values } = parseArgs({ args, options: { fix: { type: "boolean", default: false } } });
	out(`storage: ${storageRoot()}`);

	const rows = await db
		.select({ photoId: sizeVariants.photoId, type: sizeVariants.type, path: sizeVariants.path })
		.from(sizeVariants);
	const known = new Set(rows.map((r) => r.path));

	const missingOriginal = new Set<string>();
	const missingVariant = new Set<string>();
	for (const r of rows) {
		try {
			await stat(absPath(r.path));
		} catch {
			out(`missing file: ${r.path} (photo ${r.photoId}, ${r.type})`);
			(r.type === "original" ? missingOriginal : missingVariant).add(r.photoId);
		}
	}

	let orphans = 0;
	for (const variant of SIZE_VARIANT_TYPES) {
		for await (const f of filesUnder(join(storageRoot(), variant))) {
			if (!known.has(relPath(f))) {
				orphans++;
				out(`orphan file: ${relPath(f)}`);
			}
		}
	}

	const bare = await photosWithoutVariants(db);
	for (const id of bare) out(`no variants: photo ${id}`);

	const repairable = [...new Set([...missingVariant, ...bare])].filter((id) => !missingOriginal.has(id));
	out(
		`summary: ${rows.length} variant rows, ${missingOriginal.size} photos with missing originals, ${missingVariant.size} photos with missing variants, ${bare.length} photos without variants, ${orphans} orphan files`,
	);
	if (missingOriginal.size > 0) out("photos with missing originals cannot be repaired automatically");
	if (values.fix && repairable.length > 0) {
		await enqueueMany(
			db,
			"reprocess_photo",
			repairable.map((photoId) => ({ photoId })),
		);
		out(`queued ${repairable.length} reprocess_photo jobs (run by the server's job worker)`);
	} else if (repairable.length > 0) {
		out(`run "doctor --fix" to queue reprocessing of ${repairable.length} photos`);
	}
	return missingOriginal.size + missingVariant.size + bare.length + orphans > 0 ? 2 : 0;
}
