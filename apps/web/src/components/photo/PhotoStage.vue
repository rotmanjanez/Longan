<template>
	<div
		ref="containerRef"
		class="relative size-full overflow-hidden select-none"
		:class="isVideo ? '' : zoom.zoomed.value ? 'cursor-grab active:cursor-grabbing touch-none' : 'cursor-zoom-in touch-none'"
		data-photo-stage
	>
		<div v-if="isVideo" class="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
			<video
				v-if="videoSrc"
				:key="videoSrc"
				class="max-w-full max-h-full"
				controls
				playsinline
				preload="metadata"
				:poster="poster"
				:src="videoSrc"
				:aria-label="title"
			/>
			<div v-else class="relative max-w-full max-h-full">
				<img :src="poster" :alt="title" class="max-w-full max-h-[80dvh] object-contain" />
				<p v-if="detail" class="absolute inset-x-0 bottom-2 text-center text-sm text-white/80">
					{{ t("lightbox.video_unavailable") }}
				</p>
			</div>
		</div>
		<div v-else class="absolute inset-0" :style="zoom.layerStyle.value">
			<img
				v-if="placeholder && !loaded"
				:src="placeholder"
				alt=""
				aria-hidden="true"
				class="absolute object-contain blur-lg"
				:style="zoom.imageStyle.value"
			/>
			<img
				:src="currentSrc"
				:srcset="currentSrcset || undefined"
				:sizes="currentSrcset ? sizes : undefined"
				:alt="title"
				draggable="false"
				fetchpriority="high"
				decoding="async"
				class="absolute object-contain transition-opacity duration-200"
				:class="loaded ? 'opacity-100' : 'opacity-0'"
				:style="[zoom.imageStyle.value, tint]"
				@load="onLoad"
				@error="onError"
			/>
			<div
				v-if="failed"
				class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70 pointer-events-none"
				role="alert"
			>
				<UIcon name="lucide:image-off" class="size-10" />
				<span class="text-sm">{{ t("lightbox.image_failed") }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { PhotoDetail } from "@longan/shared";
import { useEventListener } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { imageSources, videoPoster, videoSource } from "./photoSources.ts";
import { usePanZoom } from "./usePanZoom.ts";

const props = defineProps<{
	albumCtx: string;
	photoId: string;
	detail?: PhotoDetail | null;
	isVideo: boolean;
	/** width / height from the listing, used until details arrive. */
	ratio?: number | null;
	title: string;
	colour?: string | null;
}>();
const emit = defineEmits<{ swipe: [dir: "prev" | "next"]; zoomed: [value: boolean] }>();
const { t } = useI18n();

const containerRef = ref<HTMLElement | null>(null);
const loaded = ref(false);
const loadedNatural = ref<{ width: number; height: number } | null>(null);

const natural = () => {
	if (props.detail && props.detail.width > 0)
		return { width: props.detail.width, height: props.detail.height };
	if (loadedNatural.value) return loadedNatural.value;
	const r = props.ratio && props.ratio > 0 ? props.ratio : 1.5;
	// Unknown resolution: assume a large picture so it fills the stage.
	return { width: 4000 * r, height: 4000 };
};

const zoom = usePanZoom(containerRef, natural, {
	enabled: () => !props.isVideo,
	onSwipe: (dir) => emit("swipe", dir),
});

/**
 * Videos have no pan/zoom, but still swipe to the neighbours. Touch events (not pointer events, which the
 * native player cancels) and never from the player's control bar at the bottom of the video.
 */
let videoSwipe: { x: number; y: number } | null = null;
useEventListener(
	containerRef,
	"touchstart",
	(e: TouchEvent) => {
		videoSwipe = null;
		const p = e.touches[0];
		if (!props.isVideo || e.touches.length !== 1 || !p) return;
		const video = (e.target as Element | null)?.closest?.("video");
		if (video && video.getBoundingClientRect().bottom - p.clientY < 64) return;
		videoSwipe = { x: p.clientX, y: p.clientY };
	},
	{ passive: true },
);
useEventListener(
	containerRef,
	"touchend",
	(e: TouchEvent) => {
		const s = videoSwipe;
		const p = e.changedTouches[0];
		videoSwipe = null;
		if (!s || !p) return;
		const dx = p.clientX - s.x;
		const dy = p.clientY - s.y;
		if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) emit("swipe", dx < 0 ? "next" : "prev");
	},
	{ passive: true },
);
watch(zoom.zoomed, (z) => emit("zoomed", z));

const sources = computed(() => imageSources(props.albumCtx, props.photoId, props.detail));
/** Once zoomed past what the display rendition offers, switch to the original (kept for this photo). */
const hiRes = ref(false);
let hiResFailed = false;
watch(
	() => [zoom.state.value.scale, zoom.fit.value.width, sources.value] as const,
	([scale, fitWidth, s]) => {
		if (hiRes.value || hiResFailed || !s.zoom || s.zoom.width <= s.width) return;
		const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
		if (scale > 1.01 && fitWidth * scale * dpr > s.width * 1.05) hiRes.value = true;
	},
);
const currentSrc = computed(() =>
	hiRes.value && sources.value.zoom ? sources.value.zoom.url : sources.value.src,
);
const currentSrcset = computed(() => (hiRes.value ? "" : sources.value.srcset));
const sizes = computed(() => `${Math.max(1, Math.round(zoom.fit.value.width))}px`);

const poster = computed(() => videoPoster(props.albumCtx, props.photoId, props.detail));
const videoSrc = computed(() => videoSource(props.albumCtx, props.photoId, props.detail));
const placeholder = computed(() =>
	props.detail?.placeholder ? `data:image/webp;base64,${props.detail.placeholder}` : null,
);
const tint = computed(() => (!loaded.value && props.colour ? { backgroundColor: props.colour } : undefined));

const failed = ref(false);
function onError() {
	// The zoomed original may be unavailable (grants, missing file): fall back to the rendition.
	if (hiRes.value) {
		hiResFailed = true;
		hiRes.value = false;
		return;
	}
	loaded.value = true;
	failed.value = true;
}

function onLoad(e: Event) {
	const img = e.target as HTMLImageElement;
	loaded.value = true;
	failed.value = false;
	if (!props.detail && img.naturalWidth > 0) {
		loadedNatural.value = { width: img.naturalWidth, height: img.naturalHeight };
	}
}

defineExpose({
	zoomIn: zoom.zoomIn,
	zoomOut: zoom.zoomOut,
	reset: zoom.reset,
	isZoomed: () => zoom.zoomed.value,
});
</script>
