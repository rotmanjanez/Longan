<template>
	<a
		:href="href"
		class="group [-webkit-touch-callout:none] block outline-none"
		:aria-label="ariaLabel"
		:aria-selected="selected || undefined"
		:data-album-id="album.id"
		@click="onClick"
		@pointerdown="press.onPointerdown"
		@contextmenu="press.onContextmenu"
	>
		<div
			class="print relative aspect-square overflow-hidden rounded-[2px] bg-elevated transition-[box-shadow] duration-200 group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-(--ui-bg)"
			:class="{ 'ring-2 ring-primary ring-offset-4 ring-offset-(--ui-bg)': selected }"
			:style="tint"
		>
			<img
				v-if="album.coverId"
				:src="thumb"
				:srcset="srcset"
				:alt="title"
				:loading="eager ? 'eager' : 'lazy'"
				:fetchpriority="eager ? 'high' : undefined"
				decoding="async"
				draggable="false"
				class="size-full object-cover transition-[filter] duration-500 group-hover:brightness-105"
				:class="{ 'blur-xl scale-110': blurred }"
			/>
			<div v-else class="absolute inset-0 flex items-center justify-center text-dimmed">
				<UIcon :name="placeholderIcon" class="size-9 stroke-[1.25]" />
			</div>

			<div
				v-if="blurred"
				class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white bg-black/25 pointer-events-none"
			>
				<UIcon name="lucide:eye-off" class="size-6" />
				<span class="text-xs font-medium">{{ t("gallery.nsfw.sensitive") }}</span>
			</div>

			<div class="absolute top-2 start-2 flex gap-1">
				<TileBadge v-if="album.isNsfw" icon="lucide:triangle-alert" :label="t('gallery.badges.nsfw')" />
				<TileBadge v-if="album.isLocked" icon="lucide:lock" :label="t('gallery.badges.locked')" />
				<TileBadge
					v-if="album.isPublic && album.requiresLogin"
					icon="lucide:users"
					:label="t('gallery.badges.signed_in')"
				/>
				<TileBadge
					v-else-if="album.isPublic && album.isLinkRequired"
					icon="lucide:link"
					:label="t('gallery.badges.link')"
				/>
				<TileBadge
					v-else-if="album.isPublic"
					icon="lucide:eye"
					:label="t('gallery.badges.public')"
				/>
			</div>
			<div v-if="selected" class="absolute inset-0 bg-primary/15 pointer-events-none" />
			<UIcon
				v-if="selected"
				name="lucide:circle-check"
				class="absolute top-2 end-2 size-5 text-primary bg-default rounded-full pointer-events-none"
			/>
		</div>

		<div class="mt-3 min-w-0 pe-1">
			<h3
				class="font-serif text-[1.0625rem] leading-snug text-highlighted truncate underline-offset-4 decoration-1 decoration-(--ui-border-accented) group-hover:underline"
				:title="title"
			>
				{{ title }}
			</h3>
			<p class="mt-0.5 text-xs text-muted">{{ t("gallery.photo_count", album.numPhotos) }}</p>
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
