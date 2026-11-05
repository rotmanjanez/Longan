<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16 flex flex-col gap-6">
		<form role="search" class="flex flex-col gap-3 max-w-2xl" @submit.prevent="submit">
			<UInput
				v-model="term"
				type="search"
				icon="lucide:search"
				size="xl"
				variant="none"
				class="w-full"
				:ui="{
					base: 'display text-3xl sm:text-4xl ps-11 pe-24 py-3 rounded-none bg-transparent ring-0 border-b border-accented focus:border-highlighted transition-colors placeholder:text-dimmed [&::-webkit-search-cancel-button]:hidden',
					leadingIcon: 'size-6 text-dimmed',
					leading: 'ps-0',
				}"
				autofocus
				:placeholder="t('search.placeholder')"
				:aria-label="t('search.label')"
			>
				<template #trailing>
					<UButton type="submit" color="neutral" variant="ghost" size="sm">{{ t("search.submit") }}</UButton>
				</template>
			</UInput>
			<p class="text-xs text-muted">{{ t("search.hint") }}</p>
		</form>

		<template v-if="q">
			<LoadingLine v-if="photos.isPending.value || albums.isPending.value" />
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
import PhotoGrid from "@/components/gallery/PhotoGrid.vue";
import LoadingLine from "@/components/layout/LoadingLine.vue";
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
const layoutMode = computed(() => config.value.defaultLayout);

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
