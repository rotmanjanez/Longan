<template>
	<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
		<form role="search" class="flex gap-2 max-w-2xl" @submit.prevent="submit">
			<UInput
				v-model="term"
				type="search"
				icon="lucide:search"
				class="flex-1"
				autofocus
				:placeholder="t('search.placeholder')"
				:aria-label="t('search.label')"
			/>
			<UButton type="submit" color="neutral" variant="outline">{{ t("search.submit") }}</UButton>
		</form>
		<p class="text-xs text-muted -mt-4">{{ t("search.hint") }}</p>

		<template v-if="q">
			<div v-if="photos.isPending.value || albums.isPending.value" class="flex justify-center py-16 text-muted" role="status">
				<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
				<span class="sr-only">{{ t("app.loading") }}</span>
			</div>
			<template v-else>
				<GallerySection v-if="albumResults.length" :title="t('search.albums', albumResults.length)">
					<AlbumGrid :albums="albumResults" />
				</GallerySection>
				<GallerySection v-if="listing && listing.ids.length" :title="t('search.photos', listing.ids.length)">
					<UAlert
						v-if="listing.isTruncated"
						color="neutral"
						variant="soft"
						icon="lucide:info"
						:title="t('search.truncated')"
					/>
					<PhotoGrid
						ref="gridRef"
						album-ctx="timeline"
						:data="listing"
						:layout-mode="layoutMode"
						:headers="false"
						:href-for="hrefFor"
						:selectable="false"
						:label="t('search.results')"
						@open="nav.open"
					/>
				</GallerySection>
				<UEmpty
					v-if="!albumResults.length && !listing?.ids.length"
					icon="lucide:search"
					:title="t('search.no_results', { q })"
				/>
			</template>
		</template>
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
import { useQuery } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { orpc } from "@/api/query.ts";
import AlbumGrid from "@/components/gallery/AlbumGrid.vue";
import GallerySection from "@/components/gallery/GallerySection.vue";
import LightboxMount from "@/components/gallery/LightboxMount.vue";
import type PhotoGrid from "@/components/gallery/PhotoGrid.vue";
import { useInit } from "@/composables/useInit.ts";
import { useLightboxNav } from "@/composables/useLightboxNav.ts";
import { useUiStore } from "@/stores/ui.ts";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const { config } = useInit();

const q = computed(() => (typeof route.query.q === "string" ? route.query.q.trim() : ""));
const photoId = computed(() =>
	typeof route.query.photo === "string" && route.query.photo ? route.query.photo : null,
);
const term = ref(q.value);
watch(q, (v) => {
	term.value = v;
});

function submit() {
	const v = term.value.trim();
	router.replace({ name: "search", query: v ? { q: v } : {} });
}

/**
 * Search results span albums and the SoA carries no per-photo album, so tiles use the "timeline" asset
 * context, which the server resolves as "any album visible to the viewer".
 */
const photos = useQuery(
	computed(() => orpc.search.photos.queryOptions({ input: { term: q.value }, enabled: q.value.length > 0 })),
);
const albums = useQuery(
	computed(() => orpc.search.albums.queryOptions({ input: { term: q.value }, enabled: q.value.length > 0 })),
);
const listing = computed(() => (q.value ? photos.data.value : undefined));
const albumResults = computed(() => (q.value ? (albums.data.value ?? []) : []));
const layoutMode = computed(() => ui.layoutOverride ?? config.value.defaultLayout);

const gridRef = ref<InstanceType<typeof PhotoGrid> | null>(null);
const location = (id: string | null) => ({
	name: "search",
	query: { q: q.value, ...(id ? { photo: id } : {}) },
});
const hrefFor = (id: string) => router.resolve(location(id)).href;
const nav = useLightboxNav({
	ids: () => listing.value?.ids ?? [],
	current: () => photoId.value,
	location,
	onClose: (id) => requestAnimationFrame(() => gridRef.value?.scrollToPhoto(id)),
});
</script>
