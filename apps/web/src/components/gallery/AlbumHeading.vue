<template>
	<div class="flex flex-col gap-5">
		<UBreadcrumb v-if="crumbs.length" :items="crumbs" :ui="{ list: 'flex-wrap' }" />
		<div class="flex flex-wrap items-end gap-x-6 gap-y-4">
			<div class="flex-1 min-w-0 flex flex-col gap-3">
				<h1 ref="titleRef" class="display text-4xl sm:text-5xl lg:text-6xl text-highlighted break-words animate-rise">
					{{ title }}
				</h1>
				<p class="text-sm sm:text-[0.9375rem] text-muted animate-rise-late">{{ caption }}</p>
			</div>
			<div class="flex items-center gap-1 animate-rise-late" data-no-drag-select>
				<UButton
					v-if="canUpload"
					icon="lucide:upload"
					color="neutral"
					variant="ghost"
					size="sm"
					:aria-label="t('gallery.actions.upload')"
					@click="emit('action', 'upload')"
				>
					<span class="hidden sm:inline">{{ t("gallery.actions.upload") }}</span>
				</UButton>
				<UDropdownMenu v-if="menu.length" :items="menu" :content="{ align: 'end' }">
					<UButton icon="lucide:ellipsis" color="neutral" variant="ghost" size="sm" :aria-label="t('gallery.actions.more')" />
				</UDropdownMenu>
			</div>
		</div>
		<p
			v-if="description"
			class="max-w-2xl font-serif text-lg leading-relaxed text-toned whitespace-pre-line break-words"
		>
			{{ description }}
		</p>
		<div v-if="head.tags.length" class="flex flex-wrap gap-1.5">
			<UBadge v-for="tag in head.tags" :key="tag.id" color="neutral" variant="soft" size="sm" icon="lucide:tag">
				{{ tag.name }}
			</UBadge>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { AlbumHead } from "@longan/shared";
import type { BreadcrumbItem, DropdownMenuItem } from "@nuxt/ui";
import { useIntersectionObserver } from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { zipUrl } from "@/api/assets.ts";
import { useInit } from "@/composables/useInit.ts";
import { plainText } from "@/lib/albums.ts";
import { useUiStore } from "@/stores/ui.ts";
import type { AlbumAction } from "./selectionActions.ts";

const props = defineProps<{ head: AlbumHead; title: string }>();
const emit = defineEmits<{ action: [name: AlbumAction] }>();
const { t, d } = useI18n();
const { user } = useInit();
const ui = useUiStore();

/** While the title is on screen the app header shows the site name; once it scrolls away, the album's. */
const titleRef = ref<HTMLElement | null>(null);
onMounted(() => {
	ui.pageTitleInView = true;
});
useIntersectionObserver(
	titleRef,
	([entry]) => {
		ui.pageTitleInView = entry?.isIntersecting ?? true;
	},
	{ rootMargin: "-64px 0px 0px 0px", threshold: 0 },
);
onBeforeUnmount(() => {
	ui.pageTitleInView = false;
});

const isSmart = computed(() => props.head.kind === "smart");
const isOwn = computed(() => user.value !== null && user.value.id === props.head.ownerId);
const description = computed(() => plainText(props.head.description));

/** Parent albums only, and only those the viewer can open (the server stops at the first one they cannot). */
const crumbs = computed<BreadcrumbItem[]>(() =>
	props.head.breadcrumbs
		.filter((b) => b.id !== props.head.id)
		.map((b) => ({ label: b.title, to: { name: "album", params: { albumId: b.id } }, active: false })),
);

const dateRange = computed(() => {
	const { minTakenAt, maxTakenAt } = props.head;
	if (!minTakenAt || !maxTakenAt) return "";
	const a = d(new Date(minTakenAt), "month");
	const b = d(new Date(maxTakenAt), "month");
	return a === b ? a : `${a} – ${b}`;
});

/** One quiet sentence under the title, like a wall label. */
const caption = computed(() => {
	const h = props.head;
	const parts = [t("gallery.photo_count", h.numPhotos)];
	if (h.numChildren > 0) parts.push(t("gallery.album_count", h.numChildren));
	if (dateRange.value) parts.push(dateRange.value);
	if (h.ownerName && !isOwn.value) parts.push(t("gallery.by_owner", { name: h.ownerName }));
	return parts.join(", ");
});

const canUpload = computed(() => props.head.rights.canUpload && props.head.kind === "album");

/** Everything but upload lives in one overflow menu: labelled rows work on touch and keep the header narrow. */
const menu = computed<DropdownMenuItem[][]>(() => {
	const r = props.head.rights;
	const real = props.head.kind === "album";
	const act = (name: AlbumAction, icon: string, extra: Partial<DropdownMenuItem> = {}): DropdownMenuItem => ({
		label: t(`gallery.actions.${name}`),
		icon,
		onSelect: () => emit("action", name),
		...extra,
	});
	const main: DropdownMenuItem[] = [];
	if (r.canEdit && real) main.push(act("createAlbum", "lucide:folder-plus"));
	if (r.canShare && !isSmart.value) main.push(act("share", "lucide:share-2"));
	if (r.canDownload && props.head.numPhotos > 0 && !isSmart.value)
		main.push({
			label: t("gallery.actions.download"),
			icon: "lucide:download",
			href: zipUrl({ albums: [props.head.id] }),
			download: true,
			external: true,
		});
	if (r.canEdit && !isSmart.value) main.push(act("albumEdit", "lucide:settings"));
	const manage: DropdownMenuItem[] = [];
	if (r.canMove && real) manage.push(act("move", "lucide:folder-input"));
	if (r.canDelete && !isSmart.value) manage.push(act("delete", "lucide:trash-2", { color: "error" }));
	return [main, manage].filter((g) => g.length > 0);
});
</script>
