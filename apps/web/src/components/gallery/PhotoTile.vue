<template>
	<a
		:href="href"
		role="listitem"
		class="group absolute block overflow-hidden rounded-lg shadow-md shadow-black/25 outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
		:class="{ 'outline-3 outline-primary': selected }"
		:style="style"
		:aria-label="title"
		:aria-selected="selected || undefined"
		:aria-posinset="index + 1"
		:aria-setsize="setSize"
		:data-photo-id="id"
		data-photo-tile
		draggable="false"
		@click="emit('activate', $event)"
		@dragstart.prevent
	>
		<img
			:src="src"
			:srcset="srcset"
			:alt="title"
			loading="lazy"
			decoding="async"
			draggable="false"
			class="size-full transition-opacity duration-300"
			:class="[fit === 'contain' ? 'object-contain' : 'object-cover', loaded ? 'opacity-100' : 'opacity-0']"
			@load="loaded = true"
		/>
		<div
			v-if="isVideo"
			class="absolute inset-0 flex items-center justify-center pointer-events-none"
			:aria-label="t('gallery.badges.video')"
		>
			<span class="size-10 rounded-full bg-black/50 flex items-center justify-center text-white">
				<UIcon name="lucide:play" class="size-5 ms-0.5" />
			</span>
		</div>
		<div class="absolute top-0 start-0 flex pointer-events-none">
			<TileBadge v-if="isHighlighted" role="favorite" icon="lucide:star" :label="t('gallery.badges.highlighted')" />
		</div>
		<div
			class="absolute inset-x-0 bottom-0 px-2.5 pt-6 pb-1.5 bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none"
		>
			<p class="text-xs font-semibold text-white truncate text-shadow-sm">{{ title }}</p>
		</div>
		<div v-if="selected" class="absolute inset-0 bg-primary/20 pointer-events-none" />
		<UIcon
			v-if="selected"
			name="lucide:circle-check"
			class="absolute top-1.5 end-1.5 size-5 text-primary bg-default rounded-full pointer-events-none"
		/>
	</a>
</template>

<script setup lang="ts">
import type { LayoutBox } from "@longan/shared/layout";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { assetUrl, srcsetFor, type VariantFamily } from "@/api/assets.ts";
import TileBadge from "./TileBadge.vue";

const props = defineProps<{
	id: string;
	albumCtx: string;
	title: string;
	/** Dominant colour shown until the image has loaded. */
	colour: string | null;
	isVideo: boolean;
	isHighlighted: boolean;
	/** Asset version (updated_at epoch seconds) for cache busting. */
	version?: number | null;
	/** Position relative to the enclosing chunk. */
	box: LayoutBox;
	family: VariantFamily;
	fit: "cover" | "contain";
	selected: boolean;
	href: string;
	index: number;
	setSize: number;
}>();
const emit = defineEmits<{ activate: [event: MouseEvent] }>();
const { t } = useI18n();

const loaded = ref(false);
watch(
	() => [props.id, props.family],
	() => {
		loaded.value = false;
	},
);

const src = computed(() => assetUrl(props.albumCtx, props.id, props.family, false, props.version));
const srcset = computed(() => srcsetFor(props.albumCtx, props.id, props.family, props.version));
const style = computed(() => ({
	top: `${props.box.top}px`,
	left: `${props.box.left}px`,
	width: `${props.box.width}px`,
	height: `${props.box.height}px`,
	backgroundColor: props.colour ?? "var(--ui-bg-elevated)",
}));
</script>
