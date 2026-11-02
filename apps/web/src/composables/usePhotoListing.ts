import type { BucketGranularity } from "@longan/shared";
import { useQuery } from "@tanstack/vue-query";
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { orpc } from "@/api/query.ts";

/** `photos.ratios` + `photos.buckets` for an album scope (real, tag or smart). */
export function usePhotoListing(
	album: MaybeRefOrGetter<string | null>,
	granularity: MaybeRefOrGetter<BucketGranularity> = "month",
	enabled: MaybeRefOrGetter<boolean> = true,
) {
	const on = computed(() => toValue(enabled) && !!toValue(album));
	const ratios = useQuery(
		computed(() =>
			orpc.photos.ratios.queryOptions({
				input: { album: toValue(album) ?? "", granularity: toValue(granularity) },
				enabled: on.value,
			}),
		),
	);
	const buckets = useQuery(
		computed(() =>
			orpc.photos.buckets.queryOptions({
				input: { album: toValue(album) ?? "", granularity: toValue(granularity) },
				enabled: on.value,
			}),
		),
	);
	return { ratios, buckets };
}
