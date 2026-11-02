<template>
	<div
		v-if="type !== 'none' && (title || lines.length)"
		class="absolute bottom-6 start-6 end-24 text-white pointer-events-none text-shadow-md"
		data-photo-overlay
	>
		<p class="text-xl sm:text-2xl font-semibold text-neutral-100 truncate">{{ title }}</p>
		<p v-for="(line, i) in lines" :key="i" class="mt-0.5 text-sm sm:text-base text-neutral-300 whitespace-pre-line line-clamp-3">
			{{ line }}
		</p>
	</div>
</template>

<script setup lang="ts">
import type { PhotoDetail } from "@longan/shared";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { plainText } from "@/lib/albums.ts";
import { formatDuration, formatTakenAt } from "@/lib/format.ts";

/** Lightbox caption (Lychee `Overlay.vue`): config.imageOverlayType = none | desc | date | exif. */
const props = defineProps<{
	type: "none" | "desc" | "date" | "exif";
	title: string;
	detail?: PhotoDetail | null;
}>();
const { t, d, locale } = useI18n();

const lines = computed(() => {
	const p = props.detail;
	if (!p) return [];
	switch (props.type) {
		case "desc": {
			const text = plainText(p.description);
			return text ? [text] : [];
		}
		case "date":
			return [
				p.takenAt ? formatTakenAt(p.takenAt, p.takenAtTz, locale.value) : d(new Date(p.createdAt), "long"),
			];
		case "exif": {
			if (p.type === "video") {
				const parts = [
					formatDuration(p.duration),
					p.fps ? t("lightbox.details.fps", { fps: Math.round(p.fps) }) : "",
				];
				const s = parts.filter(Boolean).join(" · ");
				return s ? [s] : [];
			}
			const exposure = [
				p.shutter ? (p.shutter.includes("s") ? p.shutter : `${p.shutter} s`) : "",
				p.aperture ?? "",
				p.iso ? `ISO ${p.iso}` : "",
			]
				.filter(Boolean)
				.join(" · ");
			const optics = [p.focal, p.lens ? `(${p.lens})` : ""].filter(Boolean).join(" ");
			return [exposure, optics].filter(Boolean);
		}
		default:
			return [];
	}
});
</script>
