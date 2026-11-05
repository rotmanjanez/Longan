<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16 flex flex-col gap-8">
		<PageHeading :title="t('nav.timeline')">
			<USelect
				:model-value="granularity"
				:items="granularityItems"
				icon="lucide:calendar-range"
				color="neutral"
				variant="ghost"
				size="sm"
				:content="{ align: 'end' }"
				:aria-label="t('timeline.granularity')"
				class="w-auto"
				@update:model-value="setGranularity"
			/>
		</PageHeading>
		<LoadingLine v-if="ratios.isPending.value" />
		<UEmpty
			v-else-if="ratios.isError.value"
			icon="lucide:triangle-alert"
			:title="t('errors.load_failed')"
			:description="ratios.error.value?.message"
		/>
		<PhotoGrid
			v-else-if="listing && listing.ids.length"
			ref="gridRef"
			album-ctx="timeline"
			:data="listing"
			:buckets="buckets.data.value ?? null"
			:layout-mode="layoutMode"
			:href-for="hrefFor"
			:selectable="false"
			:label="t('nav.timeline')"
			@open="nav.open"
		/>
		<UEmpty v-else icon="lucide:calendar-range" :title="t('timeline.empty')" />
		<LightboxMount
			v-if="photoId && listing"
			album-ctx="timeline"
			:photo-id="photoId"
			:ids="listing.ids"
			:listing="listing"
			@close="nav.close"
			@navigate="nav.step"
		/>
	</div>
</template>

<script setup lang="ts">
import type { BucketGranularity } from "@longan/shared";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import LightboxMount from "@/components/gallery/LightboxMount.vue";
import PhotoGrid from "@/components/gallery/PhotoGrid.vue";
import LoadingLine from "@/components/layout/LoadingLine.vue";
import PageHeading from "@/components/layout/PageHeading.vue";
import { useInit } from "@/composables/useInit.ts";
import { useLightboxNav } from "@/composables/useLightboxNav.ts";
import { usePhotoListing } from "@/composables/usePhotoListing.ts";
import { useUiStore } from "@/stores/ui.ts";

const GRANULARITIES: BucketGranularity[] = ["year", "month", "day"];

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const { config } = useInit();

const photoId = computed(() =>
	typeof route.params.photoId === "string" && route.params.photoId ? route.params.photoId : null,
);
const granularity = computed<BucketGranularity>(() => {
	const g = route.query.g;
	return g === "year" || g === "day" ? g : "month";
});
const layoutMode = computed(() => config.value.defaultLayout);

const { ratios, buckets } = usePhotoListing("timeline", granularity);
const listing = computed(() => ratios.data.value);

const granularityItems = computed(() => GRANULARITIES.map((g) => ({ value: g, label: t(`timeline.${g}`) })));

function setGranularity(g: BucketGranularity) {
	router.replace({ query: { ...route.query, g: g === "month" ? undefined : g } });
}

const gridRef = ref<InstanceType<typeof PhotoGrid> | null>(null);
const location = (id: string | null) => ({
	name: "timeline",
	params: { photoId: id ?? undefined },
	query: route.query,
});
const hrefFor = (id: string) => router.resolve(location(id)).href;
const nav = useLightboxNav({
	ids: () => listing.value?.ids ?? [],
	current: () => photoId.value,
	location,
	onClose: (id) => requestAnimationFrame(() => gridRef.value?.scrollToPhoto(id)),
});
</script>
