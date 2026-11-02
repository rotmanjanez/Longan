<template>
	<div class="relative h-[calc(100dvh-var(--ui-header-height))] w-full">
		<div ref="mapEl" class="absolute inset-0 z-0" role="application" :aria-label="t('map.label')" @click="onMapClick" />
		<div class="absolute top-3 end-3 z-10 flex flex-col items-end gap-2 pointer-events-none">
			<div
				v-if="points.isFetching.value || loadError"
				class="pointer-events-auto rounded-lg bg-default/90 backdrop-blur shadow-sm px-3 py-1.5 text-xs text-muted flex items-center gap-2"
				role="status"
			>
				<template v-if="loadError">
					<UIcon name="lucide:triangle-alert" class="size-4 text-error" />
					{{ loadError }}
				</template>
				<template v-else>
					<UIcon name="lucide:loader-circle" class="size-4 animate-spin" />
					{{ t("app.loading") }}
				</template>
			</div>
			<div
				v-if="points.data.value?.isTruncated"
				class="pointer-events-auto rounded-lg bg-default/90 backdrop-blur shadow-sm px-3 py-1.5 text-xs text-muted"
			>
				{{ t("map.truncated") }}
			</div>
		</div>
		<div
			v-if="points.isSuccess.value && points.data.value?.ids.length === 0 && !bounds"
			class="absolute inset-x-0 bottom-6 z-10 flex justify-center pointer-events-none"
		>
			<p class="rounded-lg bg-default/90 backdrop-blur shadow-sm px-3 py-1.5 text-sm text-muted">{{ t("map.empty") }}</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { useDebounceFn } from "@vueuse/core";
import type * as Leaflet from "leaflet";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { assetUrl } from "@/api/assets.ts";
import { orpc } from "@/api/query.ts";
import { useInit } from "@/composables/useInit.ts";
import { loadLeaflet } from "@/lib/leaflet.ts";

type Bounds = { north: number; south: number; east: number; west: number };

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { config } = useInit();

const albumId = computed(() =>
	typeof route.params.albumId === "string" && route.params.albumId ? route.params.albumId : undefined,
);
const mapEl = ref<HTMLElement | null>(null);
const bounds = ref<Bounds | undefined>(undefined);
const loadError = ref("");
const map = shallowRef<Leaflet.Map | null>(null);
const cluster = shallowRef<Leaflet.MarkerClusterGroup | null>(null);
let L: typeof Leaflet | null = null;
let fitted = false;

const points = useQuery(
	computed(() =>
		orpc.map.points.queryOptions({
			input: { album: albumId.value, bounds: bounds.value, limit: 5000 },
			placeholderData: keepPreviousData,
		}),
	),
);

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function render() {
	const data = points.data.value;
	if (!L || !map.value || !cluster.value || !data) return;
	const markers: Leaflet.Marker[] = [];
	for (let i = 0; i < data.ids.length; i++) {
		const id = data.ids[i] as string;
		const ctx = data.albumIds[i] as string;
		const thumb = escapeHtml(assetUrl(ctx, id, "thumb"));
		const href = escapeHtml(router.resolve({ name: "album", params: { albumId: ctx, photoId: id } }).href);
		const icon = L.divIcon({
			className: "",
			html: `<img src="${thumb}" alt="" loading="lazy" class="size-10 rounded-lg object-cover border-2 border-white shadow-md shadow-black/25 bg-elevated" />`,
			iconSize: [40, 40],
			iconAnchor: [20, 20],
		});
		const marker = L.marker([data.lats[i] as number, data.lngs[i] as number], { icon, keyboard: false });
		marker.bindPopup(
			`<a href="${href}" data-router-link class="block"><img src="${thumb}" alt="" class="size-32 rounded-md object-cover" /></a>`,
			{ closeButton: false, minWidth: 128 },
		);
		markers.push(marker);
	}
	cluster.value.clearLayers();
	cluster.value.addLayers(markers);
	if (!fitted && markers.length > 0) {
		fitted = true;
		map.value.fitBounds(L.latLngBounds(markers.map((m) => m.getLatLng())), {
			padding: [40, 40],
			maxZoom: 14,
		});
	}
}

watch(() => points.data.value, render);

const onMoveEnd = useDebounceFn(() => {
	const b = map.value?.getBounds();
	if (!b || !fitted) return;
	bounds.value = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}, 300);

/** Popup links navigate inside the SPA. */
function onMapClick(e: MouseEvent) {
	const a = e.target instanceof Element ? e.target.closest("a[data-router-link]") : null;
	if (!a) return;
	e.preventDefault();
	router.push(a.getAttribute("href") ?? "/");
}

onMounted(async () => {
	try {
		L = await loadLeaflet();
	} catch (e) {
		loadError.value = e instanceof Error ? e.message : String(e);
		return;
	}
	if (!mapEl.value) return;
	const m = L.map(mapEl.value, { worldCopyJump: true }).setView([20, 0], 2);
	L.tileLayer(config.value.mapTileUrl, { attribution: config.value.mapAttribution, maxZoom: 19 }).addTo(m);
	const c = L.markerClusterGroup({
		showCoverageOnHover: false,
		chunkedLoading: true,
		iconCreateFunction: (cl) =>
			L!.divIcon({
				className: "",
				html: `<div class="size-10 rounded-full bg-default/90 text-highlighted text-xs font-semibold flex items-center justify-center shadow-md shadow-black/25 border border-default">${cl.getChildCount()}</div>`,
				iconSize: [40, 40],
			}),
	});
	m.addLayer(c);
	m.on("moveend", onMoveEnd);
	map.value = m;
	cluster.value = c;
	render();
});

watch(albumId, () => {
	fitted = false;
	bounds.value = undefined;
});

onBeforeUnmount(() => {
	map.value?.remove();
	map.value = null;
});
</script>
