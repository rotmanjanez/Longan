<template>
	<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-lg font-bold text-highlighted flex-1">{{ t("nav.timeline") }}</h1>
			<div class="flex items-center" role="group" :aria-label="t('timeline.granularity')">
				<UButton
					v-for="g in GRANULARITIES"
					:key="g"
					size="sm"
					:color="granularity === g ? 'primary' : 'neutral'"
					:variant="granularity === g ? 'soft' : 'ghost'"
					:aria-pressed="granularity === g"
					@click="setGranularity(g)"
				>
					{{ t(`timeline.${g}`) }}
				</UButton>
			</div>
			<LayoutSwitcher :model-value="layoutMode" @update:model-value="ui.layoutOverride = $event" />
		</div>
		<div v-if="ratios.isPending.value" class="flex justify-center py-16 text-muted" role="status">
			<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
			<span class="sr-only">{{ t("app.loading") }}</span>
		</div>
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
import LayoutSwitcher from "@/components/gallery/LayoutSwitcher.vue";
import LightboxMount from "@/components/gallery/LightboxMount.vue";
import type PhotoGrid from "@/components/gallery/PhotoGrid.vue";
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
const layoutMode = computed(() => ui.layoutOverride ?? config.value.defaultLayout);

const { ratios, buckets } = usePhotoListing("timeline", granularity);
const listing = computed(() => ratios.data.value);

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
