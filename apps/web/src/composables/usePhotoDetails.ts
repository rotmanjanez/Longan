import type { PhotoDetail } from "@longan/shared";
import { computed, type MaybeRefOrGetter, ref, toValue, watch } from "vue";
import { client } from "@/api/client.ts";
import { createDetailsLoader } from "@/api/detailsLoader.ts";
import { handleApiError } from "@/api/errors.ts";

const revision = ref(0);
const generation = ref(0);

/** Shared loader: one cache for the whole app (lightbox, overlays, details drawer). */
export const photoDetailsLoader = createDetailsLoader(
	(album, ids) => client.photos.details({ album, ids }),
	() => {
		revision.value++;
	},
);

/** Call after mutating photos so mounted `usePhotoDetails` consumers refetch. */
export function invalidatePhotoDetails(photoIds?: readonly string[]) {
	photoDetailsLoader.invalidate(photoIds);
	revision.value++;
	generation.value++;
}

/**
 * `photos.details` for a set of ids, batched (<= 300 per request) and de-duplicated across all callers.
 * `details` is a reactive Map id -> PhotoDetail containing what has arrived so far.
 */
export function usePhotoDetails(
	albumCtx: MaybeRefOrGetter<string>,
	ids: MaybeRefOrGetter<readonly string[]>,
) {
	const loading = ref(false);
	const error = ref<unknown>(null);

	watch(
		() => [toValue(albumCtx), toValue(ids), generation.value] as const,
		async ([ctx, list]) => {
			if (!ctx || list.length === 0) return;
			loading.value = true;
			error.value = null;
			try {
				await photoDetailsLoader.load(ctx, list);
			} catch (e) {
				error.value = e;
				handleApiError(e);
			} finally {
				loading.value = false;
			}
		},
		{ immediate: true },
	);

	const details = computed(() => {
		void revision.value;
		const ctx = toValue(albumCtx);
		const out = new Map<string, PhotoDetail>();
		for (const id of toValue(ids)) {
			const d = photoDetailsLoader.get(ctx, id);
			if (d) out.set(id, d);
		}
		return out;
	});

	return { details, loading, error };
}
