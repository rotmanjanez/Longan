<template>
	<ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 sm:gap-6">
		<li v-for="(album, i) in albums" :key="album.id">
			<AlbumTile
				:album="album"
				:eager="i < EAGER_TILES"
				:href="router.resolve(albumRoute(album.id)).href"
				:selected="selection.albumSet.has(album.id)"
				:blurred="isBlurred(album)"
				@activate="(e) => onActivate(album.id, e)"
				@longpress="selectable && selection.longPressAlbum(album.id, ordered)"
			/>
		</li>
	</ul>
</template>

<script setup lang="ts">
import type { AlbumTile as AlbumTileT } from "@longan/shared";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useInit } from "@/composables/useInit.ts";
import { modifiersOf, useSelectionStore } from "@/stores/selection.ts";
import { useUiStore } from "@/stores/ui.ts";
import AlbumTile from "./AlbumTile.vue";

/** Covers loaded eagerly: roughly the first screenful across breakpoints (2-8 columns). */
const EAGER_TILES = 12;

const props = defineProps<{
	albums: AlbumTileT[];
	/** Allow ctrl/shift selection (smart albums are not selectable). */
	selectable?: boolean;
}>();

const router = useRouter();
const selection = useSelectionStore();
const ui = useUiStore();
const { config } = useInit();
const ordered = computed(() => props.albums.map((a) => a.id));

const albumRoute = (albumId: string) => ({ name: "album", params: { albumId } });

function isBlurred(a: AlbumTileT): boolean {
	return a.isNsfw && config.value.nsfwBlur && !ui.hasNsfwConsent(a.id);
}

function onActivate(id: string, e: MouseEvent) {
	if (e.button !== 0) return;
	if (props.selectable && selection.clickAlbum(id, ordered.value, modifiersOf(e))) {
		e.preventDefault();
		return;
	}
	if (e.metaKey || e.ctrlKey || e.shiftKey) return; // non-selectable: let the browser open a new tab
	e.preventDefault();
	selection.clear();
	router.push(albumRoute(id));
}
</script>
