<template>
	<div
		ref="containerRef"
		class="relative w-full select-none"
		:style="{ height: `${layout.totalHeight}px` }"
		role="list"
		:aria-label="label"
		@mousedown="drag.onMouseDown"
	>
		<!-- Pinned date label once the bucket's own header row has scrolled away. -->
		<div
			v-if="pinnedHeader"
			class="sticky top-(--ui-header-height) z-10 pointer-events-none flex items-center font-semibold text-toned text-lg bg-default/70 backdrop-blur"
			:style="{ height: `${HEADER_ROW_HEIGHT}px`, marginBottom: `-${HEADER_ROW_HEIGHT}px` }"
			aria-hidden="true"
		>
			{{ pinnedHeader }}
		</div>
		<div
			v-for="item in virtualItems"
			:key="String(item.key)"
			class="absolute top-0 left-0 w-full"
			:style="{
				height: `${item.size}px`,
				transform: `translate3d(0, ${item.start - scrollMargin}px, 0)`,
				contain: 'layout size',
			}"
		>
			<template v-if="chunks[item.index]">
				<h2
					v-if="chunks[item.index]!.header"
					class="flex items-center font-semibold text-toned text-lg"
					:style="{ height: `${HEADER_ROW_HEIGHT}px` }"
				>
					{{ chunks[item.index]!.header!.label }}
				</h2>
				<PhotoTile
					v-for="i in tileIndices(chunks[item.index]!)"
					:key="data.ids[i]"
					:id="data.ids[i]!"
					:album-ctx="albumCtx"
					:title="data.titles[i] ?? ''"
					:colour="data.colours[i] ?? null"
					:is-video="data.types[i] === 'video'"
					:is-highlighted="data.isHighlighteds[i] ?? false"
					:version="data.updatedAts[i] ?? null"
					:box="relativeBox(i, chunks[item.index]!.top)"
					:family="family"
					:fit="layoutMode === 'grid' ? 'contain' : 'cover'"
					:selected="selection.photoSet.has(data.ids[i]!)"
					:href="hrefFor(data.ids[i]!)"
					:index="i"
					:set-size="data.ids.length"
					@activate="(e) => onActivate(i, e)"
				/>
			</template>
		</div>
		<div
			v-if="drag.rect.value"
			class="drag-select-rect"
			:style="{
				left: `${drag.rect.value.left}px`,
				top: `${drag.rect.value.top}px`,
				width: `${drag.rect.value.width}px`,
				height: `${drag.rect.value.height}px`,
			}"
		/>
	</div>
</template>

<script setup lang="ts">
import type { PhotoBuckets, PhotoLayout, PhotoRatiosSoA } from "@longan/shared";
import type { LayoutBox } from "@longan/shared/layout";
import { defaultRangeExtractor, useWindowVirtualizer } from "@tanstack/vue-virtual";
import { useElementSize, useResizeObserver } from "@vueuse/core";
import { computed, onMounted, ref } from "vue";
import { tileFamily } from "@/api/assets.ts";
import { useDragSelect } from "@/composables/useDragSelect.ts";
import { useInit } from "@/composables/useInit.ts";
import {
	bucketRanges,
	buildChunks,
	computeGridLayout,
	type GridChunk,
	gridParams,
	HEADER_ROW_HEIGHT,
	overhangStarts,
} from "@/lib/photoGrid.ts";
import { modifiersOf, useSelectionStore } from "@/stores/selection.ts";
import { useUiStore } from "@/stores/ui.ts";
import PhotoTile from "./PhotoTile.vue";

const props = withDefaults(
	defineProps<{
		/** Album context for asset urls (album id, smart id, or "timeline" for cross-album listings). */
		albumCtx: string;
		data: PhotoRatiosSoA;
		buckets?: PhotoBuckets | null;
		layoutMode: PhotoLayout;
		/** Group by bucket with a date header row per bucket. */
		headers?: boolean;
		hrefFor: (photoId: string) => string;
		selectable?: boolean;
		label?: string;
	}>(),
	{ buckets: null, headers: true, selectable: true, label: undefined },
);
const emit = defineEmits<{ open: [photoId: string] }>();

const selection = useSelectionStore();
const ui = useUiStore();
const { config } = useInit();

const containerRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);
/** Distance from the document top to the grid: the virtualizer works in document coordinates. */
const scrollMargin = ref(0);
function measureMargin() {
	const el = containerRef.value;
	if (el) scrollMargin.value = Math.round(el.getBoundingClientRect().top + window.scrollY);
}
onMounted(measureMargin);
// Content above the grid (album header, sub-albums, toolbar) changes size: re-measure.
useResizeObserver(typeof document !== "undefined" ? document.body : null, measureMargin);

const family = computed(() => tileFamily(props.layoutMode));
const ranges = computed(() => bucketRanges(props.data.bucketIds, props.buckets, props.headers));
const params = computed(() => gridParams(props.layoutMode, width.value, config.value.layout));
const layout = computed(() =>
	computeGridLayout(props.data.ratios, ranges.value, Math.floor(width.value), params.value),
);
const chunks = computed<GridChunk[]>(() => buildChunks(layout.value, ranges.value));
const overhang = computed(() => overhangStarts(chunks.value));

const virtualizer = useWindowVirtualizer(
	computed(() => ({
		count: chunks.value.length,
		estimateSize: (i: number) => chunks.value[i]?.size ?? 0,
		getItemKey: (i: number) => chunks.value[i]?.key ?? i,
		overscan: 6,
		scrollMargin: scrollMargin.value,
		rangeExtractor: (range: Parameters<typeof defaultRangeExtractor>[0]) => {
			const base = defaultRangeExtractor(range);
			const first = overhang.value[base[0] ?? 0] ?? 0;
			if (base.length === 0 || first >= (base[0] ?? 0)) return base;
			const extra: number[] = [];
			for (let i = first; i < (base[0] as number); i++) extra.push(i);
			return extra.concat(base);
		},
	})),
);

const virtualItems = computed(() => virtualizer.value.getVirtualItems());

const pinnedHeader = computed(() => {
	const headerPx = 56;
	const offset = (virtualizer.value.scrollOffset ?? 0) + headerPx - scrollMargin.value;
	let current: string | null = null;
	for (const h of layout.value.headers) {
		if (h.top + HEADER_ROW_HEIGHT <= offset) current = h.label;
		else break;
	}
	return current;
});

function tileIndices(c: GridChunk): number[] {
	return Array.from({ length: c.count }, (_, k) => c.start + k);
}

function relativeBox(i: number, chunkTop: number): LayoutBox {
	const b = layout.value.boxes[i] as LayoutBox;
	return { top: b.top - chunkTop, left: b.left, width: b.width, height: b.height };
}

function onActivate(i: number, e: MouseEvent) {
	if (e.button !== 0) return;
	const id = props.data.ids[i] as string;
	e.preventDefault();
	if (props.selectable && selection.clickPhoto(id, props.data.ids, modifiersOf(e))) return;
	if (e.metaKey || e.ctrlKey) {
		window.open(props.hrefFor(id), "_blank", "noopener");
		return;
	}
	emit("open", id);
}

const drag = useDragSelect({
	container: containerRef,
	boxes: () => layout.value.boxes,
	ids: () => props.data.ids,
	enabled: () => props.selectable && !ui.anyDialogOpen,
});

/** Scrolls the window so the photo is visible (used when stepping through the lightbox). */
function scrollToPhoto(photoId: string) {
	const idx = props.data.ids.indexOf(photoId);
	const b = layout.value.boxes[idx];
	if (!b) return;
	const top = b.top + scrollMargin.value;
	const viewTop = window.scrollY + 56;
	const viewBottom = window.scrollY + window.innerHeight;
	if (top < viewTop || top + b.height > viewBottom) {
		window.scrollTo({ top: Math.max(0, top - window.innerHeight / 3) });
	}
}

defineExpose({ scrollToPhoto });
</script>
