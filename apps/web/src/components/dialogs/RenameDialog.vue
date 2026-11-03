<template>
	<UModal v-model:open="open" :close="false" :title="t(isAlbum ? 'dialogs.rename.title_album' : 'dialogs.rename.title_photo', count)">
		<template #body>
			<form id="rename-form" @submit.prevent="submit">
				<UFormField :label="t('dialogs.fields.title')" :hint="count > 1 ? t('dialogs.rename.many', count) : undefined">
					<UInput v-model="title" class="w-full" maxlength="300" autofocus />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="rename-form"
				:confirm-label="t('dialogs.rename.submit')"
				icon="lucide:pencil"
				:loading="rename.isPending.value"
				:disabled="!title.trim()"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";
import { photoDetailsLoader } from "@/composables/usePhotoDetails.ts";
import DialogActions from "./DialogActions.vue";
import { useAlbumCtx, useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const queryClient = useQueryClient();
const albumCtx = useAlbumCtx();
const title = ref("");
const { open, ctx, close } = useDialog("rename", () => void prefill());

const isAlbum = computed(() => ctx.value.photoIds.length === 0 && ctx.value.albumIds.length > 0);
const count = computed(() => (isAlbum.value ? ctx.value.albumIds.length : ctx.value.photoIds.length));

/** Pre-fill with the current title when renaming one item. */
async function prefill() {
	title.value = "";
	const c = ctx.value;
	if (c.photoIds.length === 0 && c.albumIds.length === 1) {
		const id = c.albumIds[0]!;
		const head = await queryClient
			.fetchQuery(orpc.albums.head.queryOptions({ input: { id } }))
			.catch(() => undefined);
		if (head && open.value && !title.value) title.value = head.title;
	} else if (c.photoIds.length === 1) {
		const id = c.photoIds[0]!;
		const map = await photoDetailsLoader.load(albumCtx.value, [id]);
		const p = map.get(id);
		if (p && open.value && !title.value) title.value = p.title;
	}
}
watch(open, (v) => {
	if (!v) title.value = "";
});

const rename = useApiAction(
	async (v: { albums: string[]; photos: string[]; title: string }) => {
		for (const id of v.albums) await client.albums.update({ id, patch: { title: v.title } });
		if (v.photos.length) await client.photos.update({ ids: v.photos, patch: { title: v.title } });
	},
	{
		invalidate: (v) => (v.photos.length ? { photos: v.photos } : { albums: true }),
		success: () => t("dialogs.rename.done"),
		after: () => close(),
	},
);

function submit() {
	const v = title.value.trim();
	if (!v) return;
	if (isAlbum.value) rename.mutate({ albums: [...ctx.value.albumIds], photos: [], title: v });
	else rename.mutate({ albums: [], photos: [...ctx.value.photoIds], title: v });
}
</script>
