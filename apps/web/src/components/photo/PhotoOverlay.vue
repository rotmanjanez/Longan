<template>
	<div
		v-if="type !== 'none' && (title || lines.length)"
		class="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] start-5 end-5 sm:start-8 sm:end-28 text-white pointer-events-none [text-shadow:0_1px_12px_rgb(0_0_0/0.6)]"
		data-photo-overlay
	>
		<p class="display text-2xl sm:text-4xl truncate">{{ title }}</p>
		<p
			v-for="(line, i) in lines"
			:key="i"
			class="mt-1.5 text-sm sm:text-base text-white/75 whitespace-pre-line line-clamp-2 sm:line-clamp-3"
		>
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
				const s = parts.filter(Boolean).join(", ");
				return s ? [s] : [];
			}
			const exposure = [
				p.shutter ? (p.shutter.includes("s") ? p.shutter : `${p.shutter} s`) : "",
				p.aperture ?? "",
				p.iso ? `ISO ${p.iso}` : "",
			]
				.filter(Boolean)
				.join(", ");
			const optics = [p.focal, p.lens ? `(${p.lens})` : ""].filter(Boolean).join(" ");
			return [exposure, optics].filter(Boolean);
		}
		default:
			return [];
	}
});
</script>
