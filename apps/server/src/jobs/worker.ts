import { and, eq, lt, sql } from "drizzle-orm";
import { type Db, db as defaultDb, type Tx } from "../db/index.ts";
import { type Job, jobs } from "../db/schema.ts";
import { log } from "../lib/log.ts";

/** In-process job runner over the `jobs` table. Handlers are registered in jobs/handlers.ts. */

export type JobHandler = (payload: Record<string, unknown>, job: Job) => Promise<void>;

const registry = new Map<string, JobHandler>();
export const MAX_ATTEMPTS = 3;
const POLL_MS = 2000;

export function registerJob(type: string, handler: JobHandler) {
	registry.set(type, handler);
}

/** Registered handler for a job type (loads the default handlers first). */
export async function jobHandler(type: string): Promise<JobHandler | undefined> {
	await loadHandlers();
	return registry.get(type);
}

/** Queue a job (usable inside a transaction). */
export async function enqueue(db: Db | Tx, type: string, payload: Record<string, unknown>): Promise<number> {
	const [row] = await db.insert(jobs).values({ type, payload }).returning({ id: jobs.id });
	return row!.id;
}

export async function enqueueMany(db: Db | Tx, type: string, payloads: Record<string, unknown>[]) {
	for (let i = 0; i < payloads.length; i += 1000) {
		await db.insert(jobs).values(payloads.slice(i, i + 1000).map((payload) => ({ type, payload })));
	}
	return payloads.length;
}

/** Backoff before attempt n+1: 30 s, 2 min, ... */
const backoffSeconds = (attempts: number) => 30 * 4 ** Math.max(0, attempts - 1);

/** Claim the next due job (FOR UPDATE SKIP LOCKED) and mark it running. */
async function claim(db: Db): Promise<Job | null> {
	return db.transaction(async (tx) => {
		const [job] = await tx
			.select()
			.from(jobs)
			.where(and(eq(jobs.status, "pending"), sql`${jobs.runAt} <= now()`))
			.orderBy(jobs.runAt, jobs.id)
			.limit(1)
			.for("update", { skipLocked: true });
		if (!job) return null;
		const [running] = await tx
			.update(jobs)
			.set({ status: "running", attempts: job.attempts + 1, updatedAt: sql`now()` })
			.where(eq(jobs.id, job.id))
			.returning();
		return running ?? null;
	});
}

async function execute(db: Db, job: Job) {
	const handler = registry.get(job.type);
	try {
		if (!handler) throw new Error(`no handler registered for job type "${job.type}"`);
		await handler(job.payload, job);
		await db
			.update(jobs)
			.set({ status: "done", lastError: null, updatedAt: sql`now()` })
			.where(eq(jobs.id, job.id));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const failed = job.attempts >= MAX_ATTEMPTS || !handler;
		log.warn("job failed", {
			id: job.id,
			type: job.type,
			attempt: job.attempts,
			final: failed,
			err: message,
		});
		await db
			.update(jobs)
			.set({
				status: failed ? "failed" : "pending",
				lastError: message.slice(0, 2000),
				runAt: failed ? job.runAt : sql`now() + make_interval(secs => ${backoffSeconds(job.attempts)})`,
				updatedAt: sql`now()`,
			})
			.where(eq(jobs.id, job.id));
	}
}

/** Run due jobs until none is left (or `max` were run). Returns the number of jobs executed. */
export async function runDueJobs(db: Db = defaultDb, max = Number.POSITIVE_INFINITY): Promise<number> {
	await loadHandlers();
	let n = 0;
	while (n < max) {
		const job = await claim(db);
		if (!job) break;
		await execute(db, job);
		n++;
	}
	return n;
}

let handlersLoaded: Promise<unknown> | null = null;
const loadHandlers = () => {
	handlersLoaded ??= import("./handlers.ts");
	return handlersLoaded;
};

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

/** Start polling every 2 s. Jobs left "running" by a crashed process (> 1 h old) are re-queued. */
export function startWorker(db: Db = defaultDb): () => void {
	stopped = false;
	const tick = async () => {
		try {
			await runDueJobs(db);
		} catch (err) {
			log.error("job worker error", { err: String(err) });
		}
		if (!stopped) timer = setTimeout(tick, POLL_MS);
	};
	void (async () => {
		try {
			await loadHandlers();
			await db
				.update(jobs)
				.set({ status: "pending", updatedAt: sql`now()` })
				.where(and(eq(jobs.status, "running"), lt(jobs.updatedAt, sql`now() - interval '1 hour'`)));
		} catch (err) {
			log.error("job worker init failed", { err: String(err) });
		}
		if (!stopped) timer = setTimeout(tick, 0);
	})();
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
