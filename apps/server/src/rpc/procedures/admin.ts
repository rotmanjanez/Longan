import { spawn } from "node:child_process";
import { statfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ORPCError } from "@orpc/server";
import { desc, eq, sql } from "drizzle-orm";
import pkg from "../../../package.json" with { type: "json" };
import { toIso } from "../../auth/users.ts";
import type { Db } from "../../db/index.ts";
import { albums, jobs, photos, users } from "../../db/schema.ts";
import { env } from "../../env.ts";
import { os } from "../base.ts";
import { requireAdmin } from "../context.ts";

function runtimeInfo() {
	const bun = (process.versions as Record<string, string | undefined>).bun;
	return bun ? { name: "bun", version: bun } : { name: "node", version: process.versions.node };
}

async function dbInfo(db: Db) {
	try {
		const rows = await db.execute<{ version: string }>(sql`select version() as version`);
		return { ok: true, version: rows[0]?.version ?? null };
	} catch {
		return { ok: false, version: null };
	}
}

async function storageInfo() {
	const path = resolve(env.STORAGE_PATH);
	// Before the first upload the directory may not exist yet: report the filesystem of the nearest ancestor.
	for (let p = path; ; p = dirname(p)) {
		try {
			const s = await statfs(p);
			return { path, freeBytes: s.bavail * s.bsize, usedBytes: (s.blocks - s.bfree) * s.bsize };
		} catch {
			if (dirname(p) === p) return { path, freeBytes: 0, usedBytes: 0 };
		}
	}
}

async function vipsInfo() {
	try {
		const sharp = (await import("sharp")).default;
		return { version: sharp.versions.vips, heif: Boolean(sharp.format.heif?.input?.file) };
	} catch {
		return { version: "unavailable", heif: false };
	}
}

/** `${FFMPEG_PATH} -version` with a 3 s timeout; version = third word of the first line. */
function ffmpegInfo(): Promise<{ available: boolean; version: string | null }> {
	return new Promise((done) => {
		let out = "";
		let settled = false;
		const finish = (r: { available: boolean; version: string | null }) => {
			if (settled) return;
			settled = true;
			done(r);
		};
		try {
			const p = spawn(env.FFMPEG_PATH, ["-version"], { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 });
			p.stdout.on("data", (d: Buffer) => {
				out += d.toString();
			});
			p.on("error", () => finish({ available: false, version: null }));
			p.on("close", (code) => {
				if (code !== 0) return finish({ available: false, version: null });
				const m = /^ffmpeg version (\S+)/m.exec(out);
				finish({ available: true, version: m?.[1] ?? null });
			});
		} catch {
			finish({ available: false, version: null });
		}
	});
}

const count = async (db: Db, table: typeof users | typeof albums | typeof photos) =>
	(await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]?.n ?? 0;

export const admin = os.admin.router({
	health: os.admin.health.handler(async ({ context: ctx }) => {
		requireAdmin(ctx);
		const db = ctx.db;
		const [dbI, storage, vips, ffmpeg, jobCounts, nUsers, nAlbums, nPhotos] = await Promise.all([
			dbInfo(db),
			storageInfo(),
			vipsInfo(),
			ffmpegInfo(),
			db
				.select({
					pending: sql<number>`count(*) filter (where ${jobs.status} = 'pending')::int`,
					failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')::int`,
				})
				.from(jobs)
				.then((r) => r[0] ?? { pending: 0, failed: 0 }),
			count(db, users),
			count(db, albums),
			count(db, photos),
		]);
		return {
			version: pkg.version,
			runtime: runtimeInfo(),
			db: dbI,
			storage,
			vips,
			ffmpeg,
			jobs: jobCounts,
			counts: { users: nUsers, albums: nAlbums, photos: nPhotos },
		};
	}),

	jobs: os.admin.jobs.handler(async ({ context: ctx, input }) => {
		requireAdmin(ctx);
		const rows = await ctx.db
			.select()
			.from(jobs)
			.orderBy(desc(jobs.createdAt), desc(jobs.id))
			.limit(input.limit);
		return rows.map((j) => ({
			id: j.id,
			type: j.type,
			status: j.status,
			attempts: j.attempts,
			runAt: toIso(j.runAt),
			lastError: j.lastError,
			createdAt: toIso(j.createdAt),
			updatedAt: toIso(j.updatedAt),
		}));
	}),

	reprocess: os.admin.reprocess.handler(async ({ context: ctx, input }) => {
		requireAdmin(ctx);
		const { enqueueMany } = await import("../../jobs/worker.ts");
		const ids = input.photoIds ?? (await ctx.db.select({ id: photos.id }).from(photos)).map((p) => p.id);
		const payloads = ids.map((photoId) =>
			input.variants ? { photoId, variants: input.variants } : { photoId },
		);
		return { queued: await enqueueMany(ctx.db, "reprocess_photo", payloads) };
	}),

	retryJob: os.admin.retryJob.handler(async ({ context: ctx, input }) => {
		requireAdmin(ctx);
		const [job] = await ctx.db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, input.id));
		if (!job) throw new ORPCError("NOT_FOUND");
		if (job.status === "running") throw new ORPCError("CONFLICT", { message: "job is running" });
		await ctx.db
			.update(jobs)
			.set({ status: "pending", runAt: sql`now()`, attempts: 0, updatedAt: sql`now()` })
			.where(eq(jobs.id, input.id));
	}),
});
