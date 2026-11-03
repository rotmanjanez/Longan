<template>
	<UModal v-model:open="open" :close="false" :title="t(isAlbum ? 'dialogs.move.title_album' : 'dialogs.move.title_photo', count)">
		<template #body>
			<form id="move-form" class="flex flex-col gap-3" @submit.prevent="submit">
				<p class="text-sm text-muted">{{ t(hintKey, count) }}</p>
				<AlbumPicker
					v-model="target"
					:exclude="isAlbum ? ctx.albumIds : []"
					:exclude-only="!isAlbum && ctx.albumId ? [ctx.albumId] : []"
					allow-root
					:root-label="isAlbum ? undefined : t('gallery.smart.unsorted')"
					:root-icon="isAlbum ? undefined : 'lucide:inbox'"
					:label="t('dialogs.move.target')"
				/>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="move-form"
				:confirm-label="t('dialogs.move.submit')"
				icon="lucide:folder-input"
				:loading="move.isPending.value"
				:disabled="target === undefined"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { emitPhotosRemoved } from "@/components/photo/events.ts";
import { useSelectionStore } from "@/stores/selection.ts";
import AlbumPicker from "./AlbumPicker.vue";
import DialogActions from "./DialogActions.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const selection = useSelectionStore();
/** undefined = nothing picked yet, null = top level (albums only). */
const target = ref<string | null | undefined>(undefined);
const { open, ctx, close } = useDialog("move", () => {
	target.value = undefined;
});

const isAlbum = computed(() => ctx.value.photoIds.length === 0);
const count = computed(() => (isAlbum.value ? ctx.value.albumIds.length : ctx.value.photoIds.length));
/** Photos from a smart album context (no source album) or into Unsorted replace all memberships. */
const hintKey = computed(() =>
	isAlbum.value
		? "dialogs.move.hint_album"
		: ctx.value.albumId && target.value !== null
			? "dialogs.move.hint_photo"
			: "dialogs.move.hint_photo_all",
);

const move = useApiAction(
	async (v: { albums: string[]; photos: string[]; from: string | null; to: string | null }) => {
		if (v.albums.length) await client.albums.move({ ids: v.albums, targetId: v.to });
		if (v.photos.length) await client.photos.move({ ids: v.photos, fromAlbum: v.from, toAlbum: v.to });
	},
	{
		invalidate: (v) => ({ albums: true, photos: v.photos.length ? v.photos : false }),
		success: () => t("dialogs.move.done"),
		after: (v) => {
			close();
			selection.clear();
			if (v.photos.length) emitPhotosRemoved(v.photos, "moved");
		},
	},
);

function submit() {
	if (target.value === undefined) return;
	move.mutate({
		albums: isAlbum.value ? [...ctx.value.albumIds] : [],
		photos: [...ctx.value.photoIds],
		from: ctx.value.albumId,
		to: target.value,
	});
}
</script>
