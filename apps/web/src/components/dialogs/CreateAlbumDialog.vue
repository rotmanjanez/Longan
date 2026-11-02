<template>
	<UModal v-model:open="open" :title="t('dialogs.create_album.title')" :description="parentTitle ? t('dialogs.create_album.inside', { title: parentTitle }) : undefined">
		<template #body>
			<form id="create-album-form" @submit.prevent="submit">
				<UFormField :label="t('dialogs.fields.title')" required>
					<UInput v-model="title" class="w-full" maxlength="300" autofocus />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="create-album-form"
				:confirm-label="t('dialogs.create_album.submit')"
				icon="lucide:folder-plus"
				:loading="create.isPending.value"
				:disabled="!title.trim()"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { client } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";
import DialogActions from "./DialogActions.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const router = useRouter();
const queryClient = useQueryClient();
const title = ref("");
const { open, ctx, close } = useDialog("createAlbum", () => {
	title.value = "";
});

const parentTitle = computed(() => {
	const id = ctx.value.albumId;
	return id ? queryClient.getQueryData(orpc.albums.head.queryKey({ input: { id } }))?.title : undefined;
});

const create = useApiAction(
	(v: { title: string; parentId: string | null }) =>
		client.albums.create({ ...v, kind: "album", tagNames: [], tagLogic: "or" }),
	{
		invalidate: () => ({ albums: true }),
		success: (v) => t("dialogs.create_album.done", { title: v.title }),
		after: async (_v, res) => {
			close();
			await router.push({ name: "album", params: { albumId: res.id } });
		},
	},
);

function submit() {
	const v = title.value.trim();
	if (v) create.mutate({ title: v, parentId: ctx.value.albumId });
}
</script>
