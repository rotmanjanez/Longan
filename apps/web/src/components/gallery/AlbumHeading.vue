<template>
	<div class="flex flex-col gap-3">
		<UBreadcrumb :items="crumbs" :ui="{ list: 'flex-wrap' }" />
		<div class="flex flex-wrap items-start gap-2">
			<div class="flex-1 min-w-0">
				<h1 class="text-lg sm:text-xl font-bold text-highlighted break-words">{{ title }}</h1>
				<p class="text-sm text-muted">
					<span>{{ t("gallery.photo_count", head.numPhotos) }}</span>
					<template v-if="head.numChildren > 0">
						<span aria-hidden="true"> · </span>
						<span>{{ t("gallery.album_count", head.numChildren) }}</span>
					</template>
					<template v-if="dateRange">
						<span aria-hidden="true"> · </span>
						<span>{{ dateRange }}</span>
					</template>
					<template v-if="head.ownerName && !isOwn">
						<span aria-hidden="true"> · </span>
						<span>{{ t("gallery.by_owner", { name: head.ownerName }) }}</span>
					</template>
				</p>
			</div>
			<div class="flex items-center gap-1" data-no-drag-select>
				<LayoutSwitcher v-if="head.numPhotos > 0" :model-value="layout" @update:model-value="emit('update:layout', $event)" />
				<USeparator v-if="actions.length" orientation="vertical" class="h-6 mx-1" />
				<UTooltip v-for="a in actions" :key="a.name" :text="t(`gallery.actions.${a.name}`)">
					<UButton
						:icon="a.icon"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="t(`gallery.actions.${a.name}`)"
						@click="emit('action', a.name)"
					/>
				</UTooltip>
				<UTooltip v-if="head.rights.canDownload && head.numPhotos > 0 && !isSmart" :text="t('gallery.actions.download')">
					<UButton
						icon="lucide:download"
						color="neutral"
						variant="ghost"
						size="sm"
						:href="zipUrl({ albums: [head.id] })"
						download
						external
						:aria-label="t('gallery.actions.download')"
					/>
				</UTooltip>
			</div>
		</div>
		<p v-if="description" class="max-w-3xl text-sm text-toned whitespace-pre-line break-words">{{ description }}</p>
		<div v-if="head.tags.length" class="flex flex-wrap gap-1">
			<UBadge v-for="tag in head.tags" :key="tag.id" color="neutral" variant="soft" size="sm" icon="lucide:tag">
				{{ tag.name }}
			</UBadge>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { AlbumHead, PhotoLayout } from "@longan/shared";
import type { BreadcrumbItem } from "@nuxt/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { zipUrl } from "@/api/assets.ts";
import { useInit } from "@/composables/useInit.ts";
import { plainText } from "@/lib/albums.ts";
import LayoutSwitcher from "./LayoutSwitcher.vue";
import type { AlbumAction } from "./selectionActions.ts";

const props = defineProps<{ head: AlbumHead; layout: PhotoLayout }>();
const emit = defineEmits<{ "update:layout": [value: PhotoLayout]; action: [name: AlbumAction] }>();
const { t, te, d } = useI18n();
const { user } = useInit();

const isSmart = computed(() => props.head.kind === "smart");
const isOwn = computed(() => user.value !== null && user.value.id === props.head.ownerId);
const title = computed(() => {
	const key = `gallery.smart.${props.head.id}`;
	return isSmart.value && te(key) ? t(key) : props.head.title;
});
const description = computed(() => plainText(props.head.description));

const crumbs = computed<BreadcrumbItem[]>(() => [
	{ label: t("nav.gallery"), icon: "lucide:images", to: "/" },
	...props.head.breadcrumbs
		.filter((b) => b.id !== props.head.id)
		.map((b) => ({ label: b.title, to: { name: "album", params: { albumId: b.id } } })),
	{ label: title.value },
]);

const dateRange = computed(() => {
	const { minTakenAt, maxTakenAt } = props.head;
	if (!minTakenAt || !maxTakenAt) return "";
	const a = d(new Date(minTakenAt), "month");
	const b = d(new Date(maxTakenAt), "month");
	return a === b ? a : `${a} – ${b}`;
});

const actions = computed(() => {
	const r = props.head.rights;
	const real = props.head.kind === "album";
	const list: { name: AlbumAction; icon: string }[] = [];
	if (r.canUpload && real) list.push({ name: "upload", icon: "lucide:upload" });
	if (r.canEdit && real) list.push({ name: "createAlbum", icon: "lucide:folder-plus" });
	if (r.canShare && !isSmart.value) list.push({ name: "share", icon: "lucide:share-2" });
	if (r.canEdit && !isSmart.value) list.push({ name: "albumEdit", icon: "lucide:settings" });
	return list;
});
</script>
