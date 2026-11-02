<template>
	<div>
		<SelectionToolbar
			v-if="selection.albumIds.length > 0"
			kind="albums"
			:count="selection.albumIds.length"
			:rights="albumRights"
			:download-href="zipUrl({ albums: selection.albumIds })"
			@action="onAction"
			@clear="selection.clear()"
			@select-all="selectAll"
		/>
		<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-8">
			<div class="flex items-center gap-2">
				<h1 class="text-lg font-bold text-highlighted flex-1">{{ t("gallery.albums") }}</h1>
				<UButton
					v-if="rights.canCreateAlbums"
					icon="lucide:folder-plus"
					color="neutral"
					variant="ghost"
					@click="ui.openDialog('createAlbum', { albumId: null })"
				>
					<span class="hidden sm:inline">{{ t("gallery.actions.new_album") }}</span>
				</UButton>
				<UButton
					v-if="rights.mayUpload"
					icon="lucide:upload"
					color="neutral"
					variant="ghost"
					@click="ui.openDialog('upload', { albumId: null })"
				>
					<span class="hidden sm:inline">{{ t("gallery.actions.upload") }}</span>
				</UButton>
			</div>

			<div v-if="root.isPending.value" class="flex justify-center py-16 text-muted" role="status">
				<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
				<span class="sr-only">{{ t("app.loading") }}</span>
			</div>
			<UEmpty
				v-else-if="root.isError.value"
				icon="lucide:triangle-alert"
				:title="t('errors.load_failed')"
				:description="root.error.value?.message"
				:actions="[{ label: t('app.retry'), icon: 'lucide:refresh-cw', color: 'neutral', variant: 'outline', onClick: () => root.refetch() }]"
			/>
			<template v-else-if="data">
				<GallerySection v-if="data.smart.length" :title="t('gallery.sections.smart')">
					<AlbumGrid :albums="data.smart" />
				</GallerySection>
				<GallerySection v-if="data.tagAlbums.length" :title="t('gallery.sections.tag_albums')">
					<AlbumGrid :albums="data.tagAlbums" :selectable="canSelect" />
				</GallerySection>
				<GallerySection v-if="data.albums.length" :title="t('gallery.sections.albums')">
					<AlbumGrid :albums="data.albums" :selectable="canSelect" />
				</GallerySection>
				<GallerySection v-if="data.shared.length" :title="t('gallery.sections.shared')">
					<AlbumGrid :albums="data.shared" :selectable="canSelect" />
				</GallerySection>
				<UEmpty
					v-if="isEmpty"
					icon="lucide:image-plus"
					:title="t('gallery.empty.root_title')"
					:description="rights.mayUpload ? t('gallery.empty.root_upload') : t('gallery.empty.root_guest')"
				/>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import { defineShortcuts } from "@nuxt/ui/composables";
import { useQuery } from "@tanstack/vue-query";
import { computed, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { zipUrl } from "@/api/assets.ts";
import { orpc } from "@/api/query.ts";
import AlbumGrid from "@/components/gallery/AlbumGrid.vue";
import GallerySection from "@/components/gallery/GallerySection.vue";
import SelectionToolbar from "@/components/gallery/SelectionToolbar.vue";
import { actionDialog, type SelectionAction } from "@/components/gallery/selectionActions.ts";
import { useInit } from "@/composables/useInit.ts";
import { useSelectionStore } from "@/stores/selection.ts";
import { useUiStore } from "@/stores/ui.ts";

const { t } = useI18n();
const ui = useUiStore();
const selection = useSelectionStore();
const { rights, isLoggedIn } = useInit();

const root = useQuery(orpc.albums.root.queryOptions());
const data = computed(() => root.data.value);
const isEmpty = computed(() => {
	const d = data.value;
	return !!d && d.smart.length + d.albums.length + d.shared.length + d.tagAlbums.length === 0;
});
const canSelect = computed(() => isLoggedIn.value);
const selectableIds = computed(() => {
	const d = data.value;
	return d ? [...d.albums, ...d.tagAlbums, ...d.shared].map((a) => a.id) : [];
});

/** Album-level rights are per album; the dialogs re-check them. Owners/admins get the full toolbar. */
const albumRights = computed(() => ({
	canEdit: rights.value.canCreateAlbums || rights.value.isAdmin,
	canMove: rights.value.canCreateAlbums || rights.value.isAdmin,
	canDelete: rights.value.canCreateAlbums || rights.value.isAdmin,
	canDownload: true,
}));

function selectAll() {
	selection.selectAll([], selectableIds.value);
}

function onAction(name: SelectionAction) {
	const dialog = actionDialog(name);
	if (dialog) ui.openDialog(dialog, { albumId: null, albumIds: [...selection.albumIds] });
}

defineShortcuts(
	computed(() => ({
		meta_a: {
			usingInput: false,
			handler: () => {
				if (canSelect.value && !ui.anyDialogOpen) selectAll();
			},
		},
		escape: () => {
			if (!ui.anyDialogOpen) selection.clear();
		},
	})),
);

onBeforeUnmount(() => selection.clear());
</script>
