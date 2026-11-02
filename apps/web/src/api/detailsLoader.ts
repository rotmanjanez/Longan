import type { PhotoDetail } from "@longan/shared";

export const DETAILS_BATCH = 300;

export type DetailsFetcher = (albumCtx: string, ids: string[]) => Promise<PhotoDetail[]>;

/**
 * Batching, de-duplicating loader for `photos.details`: ids requested in the same tick are merged,
 * split into requests of at most 300 ids, and ids already loaded or in flight are never re-requested.
 */
export function createDetailsLoader(
	fetcher: DetailsFetcher,
	onLoaded?: (ctx: string, d: PhotoDetail) => void,
) {
	const cache = new Map<string, PhotoDetail>();
	const inflight = new Map<string, Promise<PhotoDetail | undefined>>();
	const queued = new Map<string, Set<string>>();
	let flushScheduled = false;
	const k = (ctx: string, id: string) => `${ctx}\u0000${id}`;

	function flush() {
		flushScheduled = false;
		for (const [ctx, idSet] of queued) {
			const ids = [...idSet];
			for (let i = 0; i < ids.length; i += DETAILS_BATCH) {
				const batch = ids.slice(i, i + DETAILS_BATCH);
				const request = fetcher(ctx, batch).then(
					(rows) => {
						for (const d of rows) {
							cache.set(k(ctx, d.id), d);
							onLoaded?.(ctx, d);
						}
						return rows;
					},
					(err) => {
						for (const id of batch) inflight.delete(k(ctx, id));
						throw err;
					},
				);
				for (const id of batch) {
					inflight.set(
						k(ctx, id),
						request.then((rows) => {
							inflight.delete(k(ctx, id));
							return rows.find((r) => r.id === id);
						}),
					);
				}
			}
		}
		queued.clear();
	}

	/** Requests details; resolves with whatever the server returned for these ids (missing = not visible). */
	function load(ctx: string, ids: readonly string[]): Promise<Map<string, PhotoDetail>> {
		const waits: Promise<unknown>[] = [];
		for (const id of new Set(ids)) {
			const key = k(ctx, id);
			if (cache.has(key)) continue;
			const pending = inflight.get(key);
			if (pending) {
				waits.push(pending);
				continue;
			}
			let set = queued.get(ctx);
			if (!set) {
				set = new Set();
				queued.set(ctx, set);
			}
			if (set.has(id)) continue;
			set.add(id);
		}
		if (queued.size > 0 && !flushScheduled) {
			flushScheduled = true;
			queueMicrotask(flush);
		}
		return Promise.resolve()
			.then(() => {
				// After the flush the queued ids are in flight.
				for (const id of ids) {
					const p = inflight.get(k(ctx, id));
					if (p) waits.push(p);
				}
				return Promise.allSettled(waits);
			})
			.then(() => {
				const out = new Map<string, PhotoDetail>();
				for (const id of ids) {
					const d = cache.get(k(ctx, id));
					if (d) out.set(id, d);
				}
				return out;
			});
	}

	function get(ctx: string, id: string): PhotoDetail | undefined {
		return cache.get(k(ctx, id));
	}

	/** Forget cached details (all, or for some photo ids) so the next load refetches them. */
	function invalidate(photoIds?: readonly string[]) {
		if (!photoIds) {
			cache.clear();
			return;
		}
		const drop = new Set(photoIds);
		for (const key of [...cache.keys()]) {
			if (drop.has(key.slice(key.indexOf("\u0000") + 1))) cache.delete(key);
		}
	}

	return { load, get, invalidate };
}
