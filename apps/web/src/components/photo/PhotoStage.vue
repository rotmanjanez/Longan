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
			<!-- Wrapper for the zoom-in from the grid tile (playIntro), separate from the pan/zoom transform. -->
			<div ref="introRef" class="absolute inset-0 origin-top-left">
				<!-- Until the full rendition is in: colour fill, blurred placeholder, then the grid's thumbnail. -->
				<div v-if="!settled && colour" class="absolute" :style="[zoom.imageStyle.value, { backgroundColor: colour }]" />
				<img
					v-if="!settled && placeholder"
					:src="placeholder"
					alt=""
					aria-hidden="true"
					class="absolute object-contain blur-lg"
					:style="zoom.imageStyle.value"
				/>
				<img
					v-if="!settled && preview && !previewFailed"
					:src="preview.src"
					:srcset="preview.srcset || undefined"
					alt=""
					aria-hidden="true"
					draggable="false"
					class="absolute object-contain"
					:style="zoom.imageStyle.value"
					@error="previewFailed = true"
				/>
				<img
					data-photo-image
					:src="currentSrc"
					:srcset="currentSrcset || undefined"
					:sizes="currentSrcset ? sizes : undefined"
					:alt="title"
					draggable="false"
					fetchpriority="high"
					decoding="async"
					class="absolute object-contain transition-opacity duration-200"
					:class="loaded ? 'opacity-100' : 'opacity-0'"
					:style="zoom.imageStyle.value"
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
	</div>
</template>

<script setup lang="ts">
import type { PhotoDetail } from "@longan/shared";
import { useEventListener } from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
	type OriginRect,
	prefersReducedMotion,
	tileThumbnail,
	ZOOM_IN_TIMING,
} from "@/components/gallery/lightboxOrigin.ts";
import { fitRect } from "@/lib/panZoom.ts";
import { zoomInKeyframes } from "@/lib/zoomIn.ts";
import { imageSources, photoAssetUrl, videoPoster, videoSource } from "./photoSources.ts";
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
	/** Viewport rect of the grid tile this photo was opened from: zoom in from there. */
	intro?: OriginRect | null;
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
/**
 * Shown until the full rendition is in: the grid tile's loaded thumbnail (cached, so instant), else the small
 * rendition, which arrives well before medium on a slow connection.
 */
const tileSrc = tileThumbnail(props.photoId);
const preview = computed(() => {
	if (tileSrc) return { src: tileSrc, srcset: "" };
	const url = (variant: "small" | "small2x") =>
		photoAssetUrl(props.albumCtx, props.photoId, variant, props.detail);
	return { src: url("small"), srcset: `${url("small")} 1x, ${url("small2x")} 2x` };
});
const previewFailed = ref(false);
/** The full image has loaded and faded in: the stand-in layers underneath can go. */
const settled = ref(false);
let settleTimer: ReturnType<typeof setTimeout> | undefined;
watch(loaded, (l) => {
	clearTimeout(settleTimer);
	if (l) settleTimer = setTimeout(() => (settled.value = true), 250);
	else settled.value = false;
});
onBeforeUnmount(() => clearTimeout(settleTimer));

// --- zoom-in from the grid tile ----------------------------------------------------------------------
const introRef = ref<HTMLElement | null>(null);
/** Grows the image out of the grid tile it was opened from (see zoomInKeyframes). */
function playIntro(from: OriginRect) {
	const el = introRef.value;
	const box = containerRef.value;
	if (!el || !box || typeof el.animate !== "function" || prefersReducedMotion()) return;
	const c = box.getBoundingClientRect();
	const stage = { left: c.left, top: c.top, width: c.width, height: c.height };
	const frames = zoomInKeyframes(from, stage, fitRect(natural(), stage));
	if (frames) el.animate(frames, ZOOM_IN_TIMING);
}
onMounted(() => {
	if (props.intro && !props.isVideo) playIntro(props.intro);
});

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
