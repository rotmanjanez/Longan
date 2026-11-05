<template>
	<div class="flex flex-col gap-6 p-5 text-sm" data-photo-details>
		<section class="flex gap-3">
			<UIcon :name="detail.type === 'video' ? 'lucide:film' : 'lucide:image'" class="size-10 shrink-0 text-dimmed" />
			<div class="min-w-0">
				<h2 class="display text-2xl text-highlighted break-words">{{ detail.title || t("lightbox.untitled") }}</h2>
				<p class="flex flex-wrap gap-x-3 text-muted">
					<span dir="ltr">{{ detail.width }} × {{ detail.height }}</span>
					<span v-if="detail.duration">{{ formatDuration(detail.duration) }}</span>
					<span v-if="detail.fps">{{ t("lightbox.details.fps", { fps: Math.round(detail.fps) }) }}</span>
					<span dir="ltr">{{ formatBytes(detail.filesize) }}</span>
				</p>
			</div>
		</section>

		<section class="flex flex-col gap-1 text-muted">
			<p class="flex items-center gap-2">
				<UIcon name="lucide:upload" class="size-4 shrink-0" />
				<span class="sr-only">{{ t("lightbox.details.uploaded") }}</span>
				<span>{{ d(new Date(detail.createdAt), "long") }}</span>
			</p>
			<p v-if="detail.takenAt" class="flex items-center gap-2">
				<UIcon name="lucide:camera" class="size-4 shrink-0" />
				<span class="sr-only">{{ t("lightbox.details.taken") }}</span>
				<span>{{ formatTakenAt(detail.takenAt, detail.takenAtTz, locale) }}</span>
			</p>
		</section>

		<section v-if="description">
			<h3 class="font-serif text-base text-highlighted mb-1.5">{{ t("lightbox.details.description") }}</h3>
			<p class="whitespace-pre-line break-words text-toned">{{ description }}</p>
		</section>

		<section v-if="showRating || detail.rights.canEdit" class="flex flex-col gap-2">
			<div v-if="showRating" class="flex items-center justify-between gap-2">
				<h3 class="font-serif text-base text-highlighted">{{ t("lightbox.details.rating") }}</h3>
				<RatingStars
					:mine="detail.myRating"
					:avg="detail.ratingAvg"
					:readonly="!canRate || actions.rate.isPending.value"
					@rate="(n) => actions.rate.mutate({ id: detail.id, rating: n })"
				/>
			</div>
			<div v-if="detail.rights.canEdit" class="flex items-center justify-between gap-2">
				<h3 class="font-serif text-base text-highlighted">{{ t("lightbox.details.highlighted") }}</h3>
				<USwitch
					:model-value="detail.isHighlighted"
					:loading="actions.highlight.isPending.value"
					:aria-label="t('lightbox.details.highlighted')"
					@update:model-value="(v: boolean) => actions.highlight.mutate({ id: detail.id, value: v })"
				/>
			</div>
		</section>

		<section v-if="detail.tags.length">
			<h3 class="font-serif text-base text-highlighted mb-1.5">{{ t("lightbox.details.tags") }}</h3>
			<div class="flex flex-wrap gap-1.5">
				<UBadge
					v-for="tag in detail.tags"
					:key="tag.id"
					:to="{ name: 'search', query: { q: `tag:${tag.name}` } }"
					color="neutral"
					variant="soft"
					icon="lucide:tag"
					:label="tag.name"
				/>
			</div>
		</section>

		<section v-if="detail.albums.length">
			<h3 class="font-serif text-base text-highlighted mb-1.5">{{ t("lightbox.details.albums") }}</h3>
			<ul class="flex flex-col gap-0.5">
				<li v-for="a in detail.albums" :key="a.id">
					<ULink :to="{ name: 'album', params: { albumId: a.id } }" class="text-primary hover:underline">{{ a.title }}</ULink>
				</li>
			</ul>
		</section>

		<section v-if="exifRows.length">
			<h3 class="font-serif text-base text-highlighted mb-1.5">{{ t("lightbox.details.camera") }}</h3>
			<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
				<template v-for="row in exifRows" :key="row.label">
					<dt class="text-muted">{{ row.label }}</dt>
					<dd class="text-toned break-words">{{ row.value }}</dd>
				</template>
			</dl>
		</section>

		<section v-if="hasLocation">
			<h3 class="font-serif text-base text-highlighted mb-1.5">{{ t("lightbox.details.location") }}</h3>
			<RouterLink
				v-if="grid"
				:to="mapLink"
				class="relative block w-64 max-w-full h-40 overflow-hidden rounded-lg ring ring-default bg-elevated"
				:aria-label="t('lightbox.details.open_map')"
			>
				<div class="absolute size-[512px]" :style="{ left: `calc(50% - ${grid.marker.x}px)`, top: `calc(50% - ${grid.marker.y}px)` }">
					<img
						v-for="tile in grid.tiles"
						:key="tile.url"
						:src="tile.url"
						alt=""
						loading="lazy"
						decoding="async"
						class="absolute size-64 max-w-none"
						:style="{ left: `${tile.col * 256}px`, top: `${tile.row * 256}px` }"
					/>
				</div>
				<UIcon name="lucide:map-pin" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full size-7 text-error drop-shadow" />
			</RouterLink>
			<p class="mt-1 text-muted" dir="ltr">
				{{ detail.latitude!.toFixed(5) }}, {{ detail.longitude!.toFixed(5) }}
				<template v-if="detail.altitude !== null">, {{ Math.round(detail.altitude) }} m</template>
			</p>
			<ULink :href="osmLink" target="_blank" rel="noopener noreferrer" class="text-xs text-primary hover:underline">
				{{ t("lightbox.details.open_osm") }}
			</ULink>
		</section>

		<section v-if="detail.license && detail.license !== 'none'">
			<h3 class="font-serif text-base text-highlighted mb-1.5">{{ t("lightbox.details.license") }}</h3>
			<p class="text-toned">{{ t(licenseKey(detail.license)) }}</p>
		</section>

	</div>
</template>

<script setup lang="ts">
import type { PhotoDetail } from "@longan/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { RouteLocationRaw } from "vue-router";
import { useInit } from "@/composables/useInit.ts";
import { isSmartAlbumId, plainText } from "@/lib/albums.ts";
import { formatBytes, formatDuration, formatTakenAt } from "@/lib/format.ts";
import { tileGrid } from "@/lib/mapTile.ts";
import { licenseKey } from "@/lib/options.ts";
import RatingStars from "./RatingStars.vue";
import { usePhotoActions } from "./usePhotoActions.ts";

const props = defineProps<{ albumCtx: string; detail: PhotoDetail }>();
const { t, d, locale } = useI18n();
const { config, isLoggedIn } = useInit();
const actions = usePhotoActions();

const description = computed(() => plainText(props.detail.description));
const showRating = computed(() => config.value.features.ratings);
const canRate = computed(() => showRating.value && isLoggedIn.value);

const exifRows = computed(() => {
	const p = props.detail;
	const rows: { label: string; value: string }[] = [];
	const camera = [p.make, p.model].filter(Boolean).join(" ");
	if (camera) rows.push({ label: t("lightbox.details.camera_model"), value: camera });
	if (p.lens) rows.push({ label: t("lightbox.details.lens"), value: p.lens });
	if (p.shutter)
		rows.push({
			label: t("lightbox.details.shutter"),
			value: p.shutter.includes("s") ? p.shutter : `${p.shutter} s`,
		});
	if (p.aperture) rows.push({ label: t("lightbox.details.aperture"), value: p.aperture });
	if (p.iso) rows.push({ label: t("lightbox.details.iso"), value: `ISO ${p.iso}` });
	if (p.focal) rows.push({ label: t("lightbox.details.focal"), value: p.focal });
	return rows;
});

const hasLocation = computed(() => props.detail.latitude !== null && props.detail.longitude !== null);
const grid = computed(() =>
	hasLocation.value && config.value.features.map && config.value.mapTileUrl
		? tileGrid(config.value.mapTileUrl, props.detail.latitude!, props.detail.longitude!)
		: null,
);
const mapLink = computed<RouteLocationRaw>(() =>
	isSmartAlbumId(props.albumCtx) ? { name: "map" } : { name: "map", params: { albumId: props.albumCtx } },
);
const osmLink = computed(() => {
	const { latitude: lat, longitude: lng } = props.detail;
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
});
</script>
