import { SizeVariantType } from "@longan/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { photos } from "../db/schema.ts";
import { log } from "../lib/log.ts";
import { reprocessPhoto } from "../media/pipeline.ts";
import { absPath, pruneEmptyDirs, safeUnlink } from "../media/storage.ts";
import { registerJob } from "./worker.ts";

const DeleteFiles = z.object({ paths: z.array(z.string()) });
const ReprocessPhoto = z.object({ photoId: z.string(), variants: z.array(SizeVariantType).optional() });

/** Remove files of deleted photos. Paths are relative to STORAGE_PATH; missing files are ignored. */
registerJob("delete_files", async (payload) => {
	const { paths } = DeleteFiles.parse(payload);
	for (const rel of paths) {
		const abs = absPath(rel);
		await safeUnlink(abs);
		await pruneEmptyDirs(abs);
	}
	log.debug("deleted files", { count: paths.length });
});

/** Regenerate size variants of one photo (all when `variants` is omitted). */
registerJob("reprocess_photo", async (payload) => {
	const { photoId, variants } = ReprocessPhoto.parse(payload);
	const [exists] = await db.select({ id: photos.id }).from(photos).where(eq(photos.id, photoId));
	if (!exists) return; // deleted meanwhile
	await reprocessPhoto(db, photoId, variants);
});
