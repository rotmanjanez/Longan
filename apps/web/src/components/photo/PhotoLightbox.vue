<template>
	<div
		ref="rootRef"
		class="dark fixed inset-0 z-50 flex bg-black text-white"
		role="dialog"
		aria-modal="true"
		:aria-label="title"
		data-no-drag-select
		data-lightbox
		@mousemove="poke"
	>
		<div ref="stageBoxRef" class="relative flex-1 min-w-0">
			<PhotoStage
				:key="photoId"
				ref="stageRef"
				class="absolute inset-0"
				:album-ctx="albumCtx"
				:photo-id="photoId"
				:detail="detail"
				:is-video="isVideo"
				:ratio="listing?.ratios[index] ?? null"
				:colour="listing?.colours[index] ?? null"
				:title="title"
				@swipe="(dir) => (dir === 'next' ? goNext() : goPrev())"
				@zoomed="(z) => (zoomed = z)"
			/>

			<header
				class="absolute top-0 inset-x-0 z-10 flex items-center gap-1 h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] px-[max(0.5rem,env(safe-area-inset-left))] bg-linear-to-b from-black/70 to-transparent transition-opacity duration-300"
				:class="chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'"
			>
				<UButton icon="lucide:x" color="neutral" variant="ghost" size="lg" :aria-label="t('common.close')" @click="emit('close')" />
				<div class="min-w-0 flex-1">
					<p class="font-semibold truncate">{{ title }}</p>
					<p class="text-xs text-white/60 truncate">
						<span v-if="index >= 0">{{ t("lightbox.position", { n: index + 1, total: ids.length }) }}</span>
						<template v-if="subtitle"> · {{ subtitle }}</template>
					</p>
				</div>
				<div class="flex items-center">
					<UTooltip v-if="ids.length > 1 && wide" :text="t(slideshow ? 'lightbox.slideshow_stop' : 'lightbox.slideshow_start')">
						<UButton
							:icon="slideshow ? 'lucide:pause' : 'lucide:play'"
							color="neutral"
							variant="ghost"
							:aria-label="t(slideshow ? 'lightbox.slideshow_stop' : 'lightbox.slideshow_start')"
							:aria-pressed="slideshow"
							@click="toggleSlideshow"
						/>
					</UTooltip>
					<UTooltip v-if="detail?.rights.canEdit && wide" :text="t(detail.isHighlighted ? 'lightbox.unhighlight' : 'lightbox.highlight')">
						<UButton
							icon="lucide:star"
							color="neutral"
							variant="ghost"
							:class="detail.isHighlighted ? 'text-warning [&_path]:fill-current' : ''"
							:aria-label="t(detail.isHighlighted ? 'lightbox.unhighlight' : 'lightbox.highlight')"
							:aria-pressed="detail.isHighlighted"
							:loading="actions.highlight.isPending.value"
							@click="toggleHighlight"
						/>
					</UTooltip>
					<UTooltip v-if="detail?.rights.canDownload && wide" :text="t('lightbox.download')">
						<UButton
							icon="lucide:download"
							color="neutral"
							variant="ghost"
							:href="assetUrl(albumCtx, photoId, 'original', true, versionOf(detail.updatedAt))"
							download
							external
							:aria-label="t('lightbox.download')"
						/>
					</UTooltip>
					<UTooltip :text="t('lightbox.details_toggle')">
						<UButton
							icon="lucide:info"
							color="neutral"
							variant="ghost"
							:class="detailsOpen ? 'text-primary' : ''"
							:aria-label="t('lightbox.details_toggle')"
							:aria-pressed="detailsOpen"
							:disabled="!detail"
							@click="detailsOpen = !detailsOpen"
						/>
					</UTooltip>
					<UTooltip v-if="fullscreen.isSupported.value && wide" :text="t('lightbox.fullscreen')">
						<UButton
							:icon="fullscreen.isFullscreen.value ? 'lucide:minimize' : 'lucide:maximize'"
							color="neutral"
							variant="ghost"
							class="hidden sm:inline-flex"
							:aria-label="t('lightbox.fullscreen')"
							@click="fullscreen.toggle()"
						/>
					</UTooltip>
					<UDropdownMenu v-if="menuItems.length" :items="menuItems" :content="{ align: 'end' }">
						<UButton icon="lucide:ellipsis-vertical" color="neutral" variant="ghost" :aria-label="t('lightbox.more')" />
					</UDropdownMenu>
				</div>
			</header>

			<template v-if="chromeVisible && !zoomed">
				<UButton
					v-if="prevId"
					class="pointer-coarse:hidden absolute start-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 hover:bg-black/60"
					icon="lucide:chevron-left"
					color="neutral"
					variant="ghost"
					size="xl"
					:aria-label="t('lightbox.previous')"
					@click="goPrev"
				/>
				<UButton
					v-if="nextId"
					class="pointer-coarse:hidden absolute end-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/30 hover:bg-black/60"
					icon="lucide:chevron-right"
					color="neutral"
					variant="ghost"
					size="xl"
					:aria-label="t('lightbox.next')"
					@click="goNext"
				/>
			</template>
			<PhotoOverlay v-if="!zoomed && !slideshow && !isVideo" :type="config.imageOverlayType" :title="title" :detail="detail" />
		</div>

		<aside
			v-if="detailsOpen && detail"
			class="absolute inset-0 z-20 sm:static sm:w-96 shrink-0 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] bg-neutral-900 text-default border-s border-white/10"
			:aria-label="t('lightbox.details_title')"
		>
			<div class="sticky top-0 z-10 flex items-center h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] sm:h-14 sm:pt-0 px-4 bg-neutral-900/95 backdrop-blur">
				<h2 class="flex-1 font-bold text-highlighted">{{ t("lightbox.details_title") }}</h2>
				<!-- Phones only: the panel covers the photo there; on wider screens the info toggle closes it. -->
				<UButton class="sm:hidden" icon="lucide:x" color="neutral" variant="ghost" :aria-label="t('common.close')" @click="detailsOpen = false" />
			</div>
			<PhotoDetailsPanel :album-ctx="albumCtx" :detail="detail" />
		</aside>
	</div>
</template>

<script setup lang="ts">
import type { PhotoDetail } from "@longan/shared";
import type { DropdownMenuItem } from "@nuxt/ui";
import { defineShortcuts, useToast } from "@nuxt/ui/composables";
import {
	useClipboard,
	useElementSize,
	useFullscreen,
	useLocalStorage,
	useMediaQuery,
	useScrollLock,
} from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { assetUrl, versionOf } from "@/api/assets.ts";
import type { LightboxProps } from "@/components/gallery/lightbox.ts";
import { useInit } from "@/composables/useInit.ts";
import { usePhotoDetails } from "@/composables/usePhotoDetails.ts";
import { canMovePhotoFrom } from "@/lib/albums.ts";
import { fitRect } from "@/lib/panZoom.ts";
import { useUiStore } from "@/stores/ui.ts";
import { onPhotosRemoved } from "./events.ts";
import PhotoDetailsPanel from "./PhotoDetailsPanel.vue";
import PhotoOverlay from "./PhotoOverlay.vue";
import PhotoStage from "./PhotoStage.vue";
import { imageSources } from "./photoSources.ts";
import { usePhotoActions } from "./usePhotoActions.ts";

const props = defineProps<LightboxProps>();
const emit = defineEmits<{ close: []; navigate: [photoId: string] }>();
const { t, d } = useI18n();
const ui = useUiStore();
const toast = useToast();
const { config, isLoggedIn, user, rights: globalRights } = useInit();
const actions = usePhotoActions();

const rootRef = ref<HTMLElement | null>(null);
const stageRef = ref<InstanceType<typeof PhotoStage> | null>(null);
const zoomed = ref(false);
const wide = useMediaQuery("(min-width: 640px)");
/** Remembered on wide screens (side panel); on phones the panel covers the photo, so it starts closed. */
const detailsStored = useLocalStorage("longan-lightbox-details", false);
const detailsPhone = ref(false);
const detailsOpen = computed({
	get: () => (wide.value ? detailsStored.value : detailsPhone.value),
	set: (v: boolean) => {
		if (wide.value) detailsStored.value = v;
		else detailsPhone.value = v;
	},
});

// The page underneath must not scroll (touch drags on the header/edges would otherwise move it).
const scrollLock = useScrollLock(typeof document !== "undefined" ? document.body : null);
onMounted(() => (scrollLock.value = true));
onBeforeUnmount(() => (scrollLock.value = false));

const index = computed(() => props.ids.indexOf(props.photoId));
const prevId = computed(() => (index.value > 0 ? (props.ids[index.value - 1] ?? null) : null));
const nextId = computed(() =>
	index.value >= 0 && index.value < props.ids.length - 1 ? (props.ids[index.value + 1] ?? null) : null,
);
const neighbours = computed(() =>
	[index.value - 1, index.value + 1, index.value + 2]
		.filter((i) => i >= 0 && i < props.ids.length && i !== index.value)
		.map((i) => props.ids[i]!),
);

const { details } = usePhotoDetails(
	() => props.albumCtx,
	() => [props.photoId, ...neighbours.value],
);
/** Keeps showing the last known details while a refetch (after a mutation) is in flight. */
const lastDetail = shallowRef<PhotoDetail | null>(null);
watch(
	() => details.value.get(props.photoId),
	(v) => {
		if (v) lastDetail.value = v;
	},
	{ immediate: true },
);
const detail = computed<PhotoDetail | null>(
	() =>
		details.value.get(props.photoId) ?? (lastDetail.value?.id === props.photoId ? lastDetail.value : null),
);

const title = computed(() => detail.value?.title ?? props.listing?.titles[index.value] ?? "");
const isVideo = computed(() => (detail.value?.type ?? props.listing?.types[index.value]) === "video");
const subtitle = computed(() => {
	const p = detail.value;
	if (!p) return "";
	const parts: string[] = [];
	if (p.takenAt) parts.push(d(new Date(p.takenAt), "long"));
	const camera = [p.make, p.model].filter(Boolean).join(" ");
	if (camera) parts.push(camera);
	return parts.join(" · ");
});

// --- navigation --------------------------------------------------------------------------------------
function goPrev() {
	if (prevId.value) emit("navigate", prevId.value);
}
function goNext() {
	if (nextId.value) emit("navigate", nextId.value);
}

/** Deleted/moved-away photo: step to a remaining neighbour, or close. */
const stopRemoved = onPhotosRemoved((removed, kind) => {
	if (!removed.includes(props.photoId)) return;
	if (kind === "moved" && !props.albumId) return; // smart/timeline contexts keep showing it
	const gone = new Set(removed);
	const after = props.ids.slice(index.value + 1).find((id) => !gone.has(id));
	const before = [...props.ids.slice(0, Math.max(0, index.value))].reverse().find((id) => !gone.has(id));
	const target = after ?? before;
	if (target) emit("navigate", target);
	else emit("close");
});
onBeforeUnmount(stopRemoved);

// --- slideshow + chrome ------------------------------------------------------------------------------
const slideshow = ref(false);
/** Slideshow interval from `gallery.slideshow_interval_s` (seconds). */
const slideshowMs = computed(() => Math.max(1, config.value.slideshowIntervalS || 5) * 1000);
let slideTimer: ReturnType<typeof setTimeout> | undefined;
function toggleSlideshow() {
	slideshow.value = !slideshow.value;
}
watch(
	[slideshow, () => props.photoId],
	([on]) => {
		clearTimeout(slideTimer);
		if (!on) return;
		slideTimer = setTimeout(() => {
			const target = nextId.value ?? props.ids[0];
			if (target && target !== props.photoId) emit("navigate", target);
			else slideshow.value = false;
		}, slideshowMs.value);
	},
	{ immediate: true },
);

const idle = ref(false);
let idleTimer: ReturnType<typeof setTimeout> | undefined;
function poke() {
	idle.value = false;
	clearTimeout(idleTimer);
	if (slideshow.value) idleTimer = setTimeout(() => (idle.value = true), 2500);
}
watch(slideshow, (on) => {
	if (on) poke();
	else idle.value = false;
});
const chromeVisible = computed(() => !(slideshow.value && idle.value));

const fullscreen = useFullscreen(rootRef);
onBeforeUnmount(() => {
	clearTimeout(slideTimer);
	clearTimeout(idleTimer);
	if (fullscreen.isFullscreen.value) void fullscreen.exit();
});

// --- preload neighbours ------------------------------------------------------------------------------
// The neighbour's <img> will get `sizes` = its fitted width on this stage (PhotoStage); preloading with the
// same value makes the browser pick the same srcset candidate, so the preload is the file actually shown.
const stageBoxRef = ref<HTMLElement | null>(null);
const stageSize = useElementSize(stageBoxRef);
const preloaded = new Set<string>();
watch(
	[neighbours, details, stageSize.width, stageSize.height],
	([ids, map, stageW, stageH]) => {
		if (typeof Image === "undefined" || stageW <= 0 || stageH <= 0) return;
		for (const id of ids) {
			const i = props.ids.indexOf(id);
			const d = map.get(id);
			if ((d?.type ?? props.listing?.types[i]) === "video") continue;
			const s = imageSources(props.albumCtx, id, d);
			// Width descriptors only come with details (density descriptors otherwise, which ignore `sizes`).
			const sizes =
				s.srcset && d && d.width > 0 && d.height > 0
					? `${Math.max(1, Math.round(fitRect(d, { width: stageW, height: stageH }).width))}px`
					: "";
			const key = `${s.src}|${s.srcset}|${sizes}`;
			if (preloaded.has(key)) continue;
			preloaded.add(key);
			const img = new Image();
			img.decoding = "async";
			if (s.srcset) {
				if (sizes) img.sizes = sizes;
				img.srcset = s.srcset;
			}
			img.src = s.src;
		}
	},
	{ immediate: true },
);

// --- actions -----------------------------------------------------------------------------------------
function dialogCtx() {
	return { albumId: props.albumId ?? null, photoIds: [props.photoId], albumIds: [] };
}
function toggleHighlight() {
	const p = detail.value;
	if (p?.rights.canEdit) actions.highlight.mutate({ id: p.id, value: !p.isHighlighted });
}
const { copy } = useClipboard({ legacy: true });
async function copyLink() {
	await copy(window.location.href);
	toast.add({ title: t("lightbox.toast.link_copied"), color: "success", icon: "lucide:link" });
}

const menuItems = computed<DropdownMenuItem[][]>(() => {
	const p = detail.value;
	const groups: DropdownMenuItem[][] = [];
	// Phones: header buttons that don't fit move here (hidden in the header with max-sm:hidden).
	if (!wide.value) {
		const view: DropdownMenuItem[] = [];
		if (props.ids.length > 1)
			view.push({
				label: t(slideshow.value ? "lightbox.slideshow_stop" : "lightbox.slideshow_start"),
				icon: slideshow.value ? "lucide:pause" : "lucide:play",
				onSelect: toggleSlideshow,
			});
		if (p?.rights.canEdit)
			view.push({
				label: t(p.isHighlighted ? "lightbox.unhighlight" : "lightbox.highlight"),
				icon: "lucide:star",
				onSelect: toggleHighlight,
			});
		if (p?.rights.canDownload)
			view.push({
				label: t("lightbox.download"),
				icon: "lucide:download",
				href: assetUrl(props.albumCtx, props.photoId, "original", true, versionOf(p.updatedAt)),
				download: true,
				external: true,
			});
		if (view.length) groups.push(view);
	}
	if (p?.rights.canEdit) {
		const edit: DropdownMenuItem[] = [
			{
				label: t("lightbox.edit"),
				icon: "lucide:pencil",
				onSelect: () => ui.openDialog("photoEdit", dialogCtx()),
			},
			{ label: t("lightbox.tags"), icon: "lucide:tag", onSelect: () => ui.openDialog("tag", dialogCtx()) },
		];
		if (p.type === "image") {
			edit.push(
				{
					label: t("lightbox.rotate_ccw"),
					icon: "lucide:rotate-ccw",
					onSelect: () => actions.rotate.mutate({ id: p.id, direction: "ccw" }),
				},
				{
					label: t("lightbox.rotate_cw"),
					icon: "lucide:rotate-cw",
					onSelect: () => actions.rotate.mutate({ id: p.id, direction: "cw" }),
				},
			);
		}
		groups.push(edit);
	}
	const organise: DropdownMenuItem[] = [];
	const me = user.value ? { id: user.value.id, isAdmin: globalRights.value.isAdmin } : null;
	if (p && canMovePhotoFrom(props.albumCtx, p, me)) {
		organise.push({
			label: t("lightbox.move"),
			icon: "lucide:folder-input",
			onSelect: () => ui.openDialog("move", dialogCtx()),
		});
	}
	if (p && isLoggedIn.value && p.rights.canEdit) {
		organise.push({
			label: t("lightbox.copy"),
			icon: "lucide:copy",
			onSelect: () => ui.openDialog("copy", dialogCtx()),
		});
	}
	if (organise.length) groups.push(organise);
	groups.push([{ label: t("lightbox.copy_link"), icon: "lucide:link", onSelect: copyLink }]);
	if (p?.rights.canDelete) {
		groups.push([
			{
				label: t("lightbox.delete"),
				icon: "lucide:trash-2",
				color: "error",
				onSelect: () => ui.openDialog("delete", dialogCtx()),
			},
		]);
	}
	return groups;
});

// --- keyboard ----------------------------------------------------------------------------------------
const canRate = computed(() => config.value.features.ratings && isLoggedIn.value);
function rate(n: number) {
	if (canRate.value && detail.value && !zoomed.value) actions.rate.mutate({ id: detail.value.id, rating: n });
}
defineShortcuts(
	computed(() => {
		if (ui.anyDialogOpen) return {} as Record<string, () => void>;
		return {
			" ": () => props.ids.length > 1 && toggleSlideshow(),
			i: () => {
				if (detail.value) detailsOpen.value = !detailsOpen.value;
			},
			f: () => fullscreen.isSupported.value && fullscreen.toggle(),
			s: toggleHighlight,
			"+": () => stageRef.value?.zoomIn(),
			"=": () => stageRef.value?.zoomIn(),
			"-": () => stageRef.value?.zoomOut(),
			"0": () => stageRef.value?.reset(),
			"1": () => rate(1),
			"2": () => rate(2),
			"3": () => rate(3),
			"4": () => rate(4),
			"5": () => rate(5),
		};
	}),
);
</script>
