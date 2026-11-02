<template>
	<UModal v-model:open="open" :title="t(isAlbum ? 'dialogs.delete.title_album' : 'dialogs.delete.title_photo', count)">
		<template #body>
			<form id="delete-form" class="flex flex-col gap-3 text-sm" @submit.prevent="submit">
				<p>{{ t(isAlbum ? "dialogs.delete.confirm_album" : "dialogs.delete.confirm_photo", { n: count, title: singleTitle }, count) }}</p>
				<UAlert
					v-if="isAlbum"
					color="error"
					variant="subtle"
					icon="lucide:triangle-alert"
					:description="t('dialogs.delete.album_warning')"
				/>
				<p class="text-muted">{{ t("dialogs.delete.irreversible") }}</p>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="delete-form"
				:confirm-label="t('dialogs.delete.submit')"
				icon="lucide:trash-2"
				danger
				:loading="remove.isPending.value"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { client } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";
import { emitPhotosRemoved } from "@/components/photo/events.ts";
import { useSelectionStore } from "@/stores/selection.ts";
import DialogActions from "./DialogActions.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const selection = useSelectionStore();
const { open, ctx, close } = useDialog("delete");

const isAlbum = computed(() => ctx.value.photoIds.length === 0);
const count = computed(() => (isAlbum.value ? ctx.value.albumIds.length : ctx.value.photoIds.length));
const singleTitle = computed(() => {
	if (!isAlbum.value || count.value !== 1) return "";
	const id = ctx.value.albumIds[0]!;
	return queryClient.getQueryData(orpc.albums.head.queryKey({ input: { id } }))?.title ?? "";
});

const remove = useApiAction(
	async (v: { albums: string[]; photos: string[] }) => {
		if (v.photos.length) await client.photos.delete({ ids: v.photos });
		if (v.albums.length) await client.albums.delete({ ids: v.albums });
	},
	{
		invalidate: (v) => ({ albums: true, photos: v.photos.length ? v.photos : true }),
		success: (v) =>
			t(
				v.albums.length ? "dialogs.delete.done_album" : "dialogs.delete.done_photo",
				v.albums.length || v.photos.length,
			),
		after: async (v) => {
			close();
			selection.clear();
			if (v.photos.length) emitPhotosRemoved(v.photos, "deleted");
			// Deleting the album being viewed: go to its parent.
			const current = route.params.albumId;
			if (typeof current === "string" && v.albums.includes(current)) {
				const head = queryClient.getQueryData(orpc.albums.head.queryKey({ input: { id: current } }));
				if (head?.parentId) await router.replace({ name: "album", params: { albumId: head.parentId } });
				else await router.replace({ name: "root" });
			}
		},
	},
);

function submit() {
	remove.mutate({ albums: isAlbum.value ? [...ctx.value.albumIds] : [], photos: [...ctx.value.photoIds] });
}
</script>
