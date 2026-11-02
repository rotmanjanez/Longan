<template>
	<!--
		Minimal photo viewer so `/.../:photoId` routes work end to end.
		SECOND WEB AGENT: replaced by the real lightbox (components/photo/PhotoPanel.vue) via LightboxMount.vue.
	-->
	<div
		class="fixed inset-0 z-50 flex flex-col bg-black text-white"
		role="dialog"
		aria-modal="true"
		:aria-label="title"
		data-no-drag-select
	>
		<div class="flex items-center gap-2 h-14 px-2 shrink-0">
			<UButton icon="lucide:x" color="neutral" variant="ghost" class="text-white" :aria-label="t('common.close')" @click="emit('close')" />
			<div class="min-w-0">
				<p class="font-semibold truncate">{{ title }}</p>
				<p v-if="subtitle" class="text-xs text-white/60 truncate">{{ subtitle }}</p>
			</div>
		</div>
		<div class="relative flex-1 min-h-0 flex items-center justify-center">
			<video
				v-if="isVideo"
				:key="`v-${photoId}`"
				class="max-w-full max-h-full"
				controls
				playsinline
				:poster="assetUrl(albumCtx, photoId, 'medium')"
				:src="assetUrl(albumCtx, photoId, 'original')"
			/>
			<img
				v-else
				:key="photoId"
				:src="assetUrl(albumCtx, photoId, 'medium')"
				:srcset="srcsetFor(albumCtx, photoId, 'medium')"
				:alt="title"
				class="max-w-full max-h-full object-contain"
			/>
			<UButton
				v-if="prevId"
				class="absolute start-2 top-1/2 -translate-y-1/2 text-white"
				icon="lucide:chevron-left"
				color="neutral"
				variant="ghost"
				size="xl"
				:aria-label="t('lightbox.previous')"
				@click="emit('navigate', prevId)"
			/>
			<UButton
				v-if="nextId"
				class="absolute end-2 top-1/2 -translate-y-1/2 text-white"
				icon="lucide:chevron-right"
				color="neutral"
				variant="ghost"
				size="xl"
				:aria-label="t('lightbox.next')"
				@click="emit('navigate', nextId)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { assetUrl, srcsetFor } from "@/api/assets.ts";
import { usePhotoDetails } from "@/composables/usePhotoDetails.ts";
import type { LightboxProps } from "./lightbox.ts";

const props = defineProps<LightboxProps>();
const emit = defineEmits<{ close: []; navigate: [photoId: string] }>();
const { t, d } = useI18n();

const index = computed(() => props.ids.indexOf(props.photoId));
const prevId = computed(() => (index.value > 0 ? props.ids[index.value - 1] : undefined));
const nextId = computed(() => (index.value >= 0 ? props.ids[index.value + 1] : undefined));
const title = computed(() => props.listing?.titles[index.value] ?? "");
const isVideo = computed(() => props.listing?.types[index.value] === "video");

const { details } = usePhotoDetails(
	() => props.albumCtx,
	() => [props.photoId],
);
const subtitle = computed(() => {
	const p = details.value.get(props.photoId);
	if (!p) return "";
	const parts: string[] = [];
	if (p.takenAt) parts.push(d(new Date(p.takenAt), "long"));
	const camera = [p.make, p.model].filter(Boolean).join(" ");
	if (camera) parts.push(camera);
	return parts.join(" · ");
});
</script>
