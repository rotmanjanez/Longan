<template>
	<a
		:href="href"
		class="group [-webkit-touch-callout:none] relative block aspect-square rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
		:class="{ 'outline-2 outline-primary': selected }"
		:aria-label="ariaLabel"
		:aria-selected="selected || undefined"
		:data-album-id="album.id"
		@click="onClick"
		@pointerdown="press.onPointerdown"
		@contextmenu="press.onContextmenu"
	>
		<template v-if="album.coverId">
			<!-- Two decorative copies fan out on hover: a small stack of prints (Lychee DESIGN.md). Same src/srcset as
			     the cover, so all three share one download. -->
			<img
				v-for="cls in PRINTS"
				:key="cls"
				:src="thumb"
				:srcset="srcset"
				alt=""
				aria-hidden="true"
				:loading="eager ? 'eager' : 'lazy'"
				decoding="async"
				draggable="false"
				class="album-print absolute inset-0 size-full object-cover rounded-lg shadow-md shadow-black/25"
				:class="[cls, { 'blur-xl': blurred }]"
				:style="tint"
			/>
			<img
				:src="thumb"
				:srcset="srcset"
				:alt="title"
				:loading="eager ? 'eager' : 'lazy'"
				:fetchpriority="eager ? 'high' : undefined"
				decoding="async"
				draggable="false"
				class="album-print absolute inset-0 size-full object-cover rounded-lg shadow-md shadow-black/25"
				:class="{ 'blur-xl': blurred }"
				:style="tint"
			/>
		</template>
		<div
			v-else
			class="absolute inset-0 rounded-lg bg-elevated shadow-md shadow-black/25 flex items-center justify-center text-dimmed"
		>
			<UIcon :name="placeholderIcon" class="size-12" />
		</div>

		<div
			v-if="blurred"
			class="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-1 text-white bg-black/30 pointer-events-none"
		>
			<UIcon name="lucide:eye-off" class="size-6" />
			<span class="text-xs font-semibold">{{ t("gallery.nsfw.sensitive") }}</span>
		</div>

		<div class="absolute inset-x-0 bottom-0 rounded-b-lg bg-linear-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-shadow-sm">
			<h3 class="text-sm font-bold text-white truncate" :title="title">{{ title }}</h3>
			<p class="text-2xs text-white/75">{{ t("gallery.photo_count", album.numPhotos) }}</p>
		</div>

		<div class="absolute top-0 start-2 flex">
			<TileBadge v-if="album.isNsfw" role="nsfw" icon="lucide:triangle-alert" :label="t('gallery.badges.nsfw')" />
			<TileBadge v-if="album.isLocked" role="danger" icon="lucide:lock" :label="t('gallery.badges.locked')" />
			<TileBadge
				v-if="album.isPublic && album.isLinkRequired"
				role="link"
				icon="lucide:link"
				:label="t('gallery.badges.link')"
			/>
			<TileBadge
				v-else-if="album.isPublic"
				role="success"
				icon="lucide:eye"
				:label="t('gallery.badges.public')"
			/>
		</div>
		<div
			v-if="selected"
			class="absolute top-1.5 end-1.5 size-5 rounded-full bg-default flex items-center justify-center pointer-events-none"
		>
			<UIcon name="lucide:circle-check" class="size-5 text-primary" />
		</div>
	</a>
</template>

<script setup lang="ts">
import type { AlbumTile } from "@longan/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { assetUrl, srcsetFor } from "@/api/assets.ts";
import { useLongPress } from "@/composables/useLongPress.ts";
import { SMART_ALBUM_ICONS } from "@/lib/albums.ts";
import TileBadge from "./TileBadge.vue";

const PRINTS = [
	"group-hover:-rotate-2 group-hover:-translate-x-3 group-hover:translate-y-2",
	"group-hover:rotate-6 group-hover:translate-x-3 group-hover:-translate-y-2",
] as const;

const props = defineProps<{
	album: AlbumTile;
	href: string;
	selected?: boolean;
	/** Blur the cover (NSFW album without consent). */
	blurred?: boolean;
	/** Within the first screenful: load the cover immediately at high priority. */
	eager?: boolean;
}>();
const emit = defineEmits<{ activate: [event: MouseEvent]; longpress: [] }>();

const press = useLongPress(() => emit("longpress"));
function onClick(e: MouseEvent) {
	if (press.consumeClick()) {
		e.preventDefault();
		return;
	}
	emit("activate", e);
}
const { t, te } = useI18n();

const title = computed(() => {
	const key = `gallery.smart.${props.album.id}`;
	return props.album.kind === "smart" && te(key) ? t(key) : props.album.title;
});
const ariaLabel = computed(() => `${title.value}, ${t("gallery.photo_count", props.album.numPhotos)}`);
const thumb = computed(() =>
	props.album.coverId ? assetUrl(props.album.id, props.album.coverId, "thumb") : "",
);
const srcset = computed(() =>
	props.album.coverId ? srcsetFor(props.album.id, props.album.coverId, "thumb") : "",
);
const tint = computed(() =>
	props.album.coverColour ? { backgroundColor: props.album.coverColour } : undefined,
);
const placeholderIcon = computed(() => {
	if (props.album.isLocked) return "lucide:lock";
	if (props.album.kind === "smart") return SMART_ALBUM_ICONS[props.album.id] ?? "lucide:images";
	if (props.album.kind === "tag") return "lucide:tags";
	return "lucide:image-off";
});
</script>
