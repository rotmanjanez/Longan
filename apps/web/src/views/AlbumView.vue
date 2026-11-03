<template>
	<div>
		<SelectionToolbar
			v-if="selection.hasSelection && headData"
			:kind="selection.photoIds.length > 0 ? 'photos' : 'albums'"
			:count="selection.photoIds.length || selection.albumIds.length"
			:rights="toolbarRights"
			:download-href="downloadHref"
			@action="onSelectionAction"
			@clear="selection.clear()"
			@select-all="selectAll"
		/>
		<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
			<div v-if="head.isPending.value" class="flex justify-center py-16 text-muted" role="status">
				<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
				<span class="sr-only">{{ t("app.loading") }}</span>
			</div>
			<UEmpty
				v-else-if="headErrorCode === 'PASSWORD_REQUIRED'"
				icon="lucide:lock"
				:title="t('gallery.locked.title')"
				:description="t('gallery.locked.description')"
				:actions="[{ label: t('dialogs.unlock.submit'), icon: 'lucide:lock-open', color: 'neutral', variant: 'outline', onClick: () => ui.openUnlock(albumId) }]"
			/>
			<UEmpty
				v-else-if="head.isError.value"
				icon="lucide:image-off"
				:title="headErrorCode === 'NOT_FOUND' || headErrorCode === 'FORBIDDEN' ? t('gallery.not_found') : t('errors.load_failed')"
				:description="head.error.value?.message"
				:actions="[{ label: t('nav.gallery'), icon: 'lucide:images', color: 'neutral', variant: 'outline', to: '/' }]"
			/>
			<template v-else-if="headData">
				<AlbumHeading :head="headData" @action="onAlbumAction" />
				<SensitiveWarning v-if="nsfwBlocked" @consent="ui.consentNsfw(albumId)" />
				<template v-else>
					<AlbumGrid v-if="childAlbums.length" :albums="childAlbums" :selectable="headData.rights.canEdit" />
					<USeparator v-if="childAlbums.length && listing" />
					<div v-if="ratios.isPending.value && headData.numPhotos > 0" class="flex justify-center py-16 text-muted" role="status">
						<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
					</div>
					<PhotoGrid
						v-else-if="listing && listing.ids.length"
						ref="gridRef"
						:album-ctx="resolvedId"
						:data="listing"
						:buckets="buckets.data.value ?? null"
						:layout-mode="layoutMode"
						:headers="dateHeaders"
						:href-for="hrefFor"
						:selectable="headData.rights.canEdit || headData.rights.canDownload"
						:label="t('gallery.photos')"
						@open="nav.open"
					/>
					<UEmpty
						v-else-if="!childAlbums.length && !children.isPending.value"
						icon="lucide:image-plus"
						:title="t('gallery.empty.album_title')"
						:description="headData.rights.canUpload ? t('gallery.empty.album_upload') : undefined"
					/>
				</template>
			</template>
		</div>
		<PageDropZone :album-id="resolvedId" :target-title="headData?.title" :enabled="canUploadHere && !photoId" />
		<LightboxMount
			v-if="photoId && listing && !nsfwBlocked"
			:album-ctx="resolvedId"
			:photo-id="photoId"
			:ids="listing.ids"
			:listing="listing"
			:album-id="isReal ? resolvedId : null"
			@close="nav.close"
			@navigate="nav.step"
		/>
	</div>
</template>

<script setup lang="ts">
import { defineShortcuts } from "@nuxt/ui/composables";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { zipUrl } from "@/api/assets.ts";
import { client } from "@/api/client.ts";
import { errorCode } from "@/api/errors.ts";
import { orpc } from "@/api/query.ts";
import AlbumGrid from "@/components/gallery/AlbumGrid.vue";
import AlbumHeading from "@/components/gallery/AlbumHeading.vue";
import LightboxMount from "@/components/gallery/LightboxMount.vue";
import PhotoGrid from "@/components/gallery/PhotoGrid.vue";
import SelectionToolbar from "@/components/gallery/SelectionToolbar.vue";
import SensitiveWarning from "@/components/gallery/SensitiveWarning.vue";
import {
	type AlbumAction,
	actionDialog,
	type SelectionAction,
} from "@/components/gallery/selectionActions.ts";
import PageDropZone from "@/components/upload/PageDropZone.vue";
import { useInit } from "@/composables/useInit.ts";
import { useLightboxNav } from "@/composables/useLightboxNav.ts";
import { invalidatePhotoDetails, usePhotoDetails } from "@/composables/usePhotoDetails.ts";
import { usePhotoListing } from "@/composables/usePhotoListing.ts";
import { albumTitle, canMovePhotoFrom, isSmartAlbumId } from "@/lib/albums.ts";
import { useSelectionStore } from "@/stores/selection.ts";
import { useUiStore } from "@/stores/ui.ts";

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const selection = useSelectionStore();
const queryClient = useQueryClient();
const { config, user, rights: globalRights } = useInit();

const albumId = computed(() => String(route.params.albumId ?? ""));
const photoId = computed(() =>
	typeof route.params.photoId === "string" && route.params.photoId ? route.params.photoId : null,
);
const isReal = computed(() => !isSmartAlbumId(albumId.value));

const head = useQuery(computed(() => orpc.albums.head.queryOptions({ input: { id: albumId.value } })));
const headData = computed(() => head.data.value);
const headErrorCode = computed(() => errorCode(head.error.value));
/** The route may carry a slug; listings and asset urls need the real id (from albums.head). */
const resolvedId = computed(() => headData.value?.id ?? albumId.value);
const nsfwBlocked = computed(() => !!headData.value?.isNsfw && !ui.hasNsfwConsent(albumId.value));

const children = useQuery(
	computed(() =>
		orpc.albums.children.queryOptions({
			input: { id: resolvedId.value },
			enabled: isReal.value && (headData.value?.numChildren ?? 0) > 0,
		}),
	),
);
const childAlbums = computed(() =>
	(headData.value?.numChildren ?? 0) > 0 ? (children.data.value ?? []) : [],
);

const { ratios, buckets } = usePhotoListing(
	resolvedId,
	"month",
	computed(() => head.isSuccess.value && !nsfwBlocked.value && (headData.value?.numPhotos ?? 0) > 0),
);
const listing = computed(() => ((headData.value?.numPhotos ?? 0) > 0 ? ratios.data.value : undefined));

/** Set per album in Album settings; smart albums use the server default. */
const layoutMode = computed(() => headData.value?.photoLayout ?? config.value.defaultLayout);
/** Date headers only make sense when the album is ordered by a date. */
const dateHeaders = computed(() => {
	const col = headData.value?.photoSorting?.col;
	return !col || col === "taken_at" || col === "created_at";
});

const gridRef = ref<InstanceType<typeof PhotoGrid> | null>(null);
const hrefFor = (id: string) =>
	router.resolve({ name: "album", params: { albumId: albumId.value, photoId: id } }).href;
const nav = useLightboxNav({
	ids: () => listing.value?.ids ?? [],
	current: () => photoId.value,
	location: (id) => ({ name: "album", params: { albumId: albumId.value, photoId: id ?? undefined } }),
	onClose: (id) => requestAnimationFrame(() => gridRef.value?.scrollToPhoto(id)),
});

// Shown in the app header (and the document title) instead of a heading on the page.
watch(
	() => headData.value && albumTitle(headData.value, t, te),
	(title) => {
		ui.pageTitle = title ?? null;
	},
	{ immediate: true },
);
watch(albumId, () => selection.clear());
watch([listing, childAlbums], ([l, c]) =>
	selection.prune(
		l?.ids ?? [],
		c.map((a) => a.id),
	),
);
onBeforeUnmount(() => {
	ui.pageTitle = null;
	selection.clear();
});

/** Smart albums carry no album-level edit rights: the toolbar uses the per-photo rights of the selection. */
const isSmart = computed(() => headData.value?.kind === "smart");
const { details: selectedDetails } = usePhotoDetails(
	() => (isSmart.value ? resolvedId.value : ""),
	() => (isSmart.value ? selection.photoIds : []),
);
function selectionAllows(right: "canEdit" | "canMove" | "canDelete"): boolean {
	const ids = selection.photoIds;
	if (ids.length === 0) return false;
	const me = user.value ? { id: user.value.id, isAdmin: globalRights.value.isAdmin } : null;
	return ids.every((id) => {
		const d = selectedDetails.value.get(id);
		if (!d) return false;
		return right === "canMove" ? canMovePhotoFrom(resolvedId.value, d, me) : d.rights[right] === true;
	});
}
const toolbarRights = computed(() => {
	const r = headData.value?.rights;
	const smart = isSmart.value;
	return {
		canEdit: !!r?.canEdit || (smart && selectionAllows("canEdit")),
		canMove: !!r?.canMove || (smart && selectionAllows("canMove")),
		canDelete: !!r?.canDelete || (smart && selectionAllows("canDelete")),
		canDownload: !!r?.canDownload,
	};
});
const downloadHref = computed(() =>
	selection.photoIds.length > 0
		? zipUrl({ photos: selection.photoIds })
		: zipUrl({ albums: selection.albumIds }),
);

function selectAll() {
	const ids = listing.value?.ids ?? [];
	if (ids.length > 0) selection.selectAll(ids);
	else
		selection.selectAll(
			[],
			childAlbums.value.map((a) => a.id),
		);
}

const highlight = useMutation({
	mutationFn: (vars: { ids: string[]; value: boolean }) => client.photos.highlight(vars),
	onSuccess: async (_d, vars) => {
		invalidatePhotoDetails(vars.ids);
		await queryClient.invalidateQueries({ queryKey: orpc.photos.key() });
	},
});

function onSelectionAction(name: SelectionAction) {
	const ctx = {
		albumId: isReal.value ? resolvedId.value : null,
		photoIds: [...selection.photoIds],
		albumIds: [...selection.albumIds],
	};
	if (name === "highlight") {
		const l = listing.value;
		const selected = selection.photoSet;
		const allHighlighted = !!l && l.ids.every((id, i) => !selected.has(id) || l.isHighlighteds[i]);
		highlight.mutate({ ids: ctx.photoIds, value: !allHighlighted });
		return;
	}
	const dialog = actionDialog(name);
	if (dialog) ui.openDialog(dialog, ctx);
}

function onAlbumAction(name: AlbumAction) {
	ui.openDialog(name, { albumId: resolvedId.value, photoIds: [], albumIds: [resolvedId.value] });
}

const canUploadHere = computed(
	() => !!headData.value?.rights.canUpload && headData.value.kind === "album" && !nsfwBlocked.value,
);
const canCreateHere = computed(() => !!headData.value?.rights.canEdit && headData.value.kind === "album");

defineShortcuts(
	computed(() => ({
		meta_a: {
			usingInput: false,
			handler: () => {
				if (!photoId.value && !ui.anyDialogOpen) selectAll();
			},
		},
		escape: () => {
			if (!photoId.value && !ui.anyDialogOpen) selection.clear();
		},
		u: () => {
			if (!photoId.value && !ui.anyDialogOpen && canUploadHere.value) onAlbumAction("upload");
		},
		n: () => {
			if (!photoId.value && !ui.anyDialogOpen && canCreateHere.value) onAlbumAction("createAlbum");
		},
	})),
);
</script>
