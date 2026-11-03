<template>
	<UModal v-model:open="open" :close="false" :title="t('dialogs.create_tag_album.title')" :description="t('dialogs.create_tag_album.description')">
		<template #body>
			<form id="create-tag-album-form" class="flex flex-col gap-4" @submit.prevent="submit">
				<UFormField :label="t('dialogs.fields.title')" required>
					<UInput v-model="title" class="w-full" maxlength="300" autofocus />
				</UFormField>
				<UFormField :label="t('dialogs.fields.tags')" required>
					<TagInput v-model="tags" />
				</UFormField>
				<UFormField :label="t('dialogs.fields.tag_logic')">
					<USelect v-model="logic" :items="logicItems" class="w-full" />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="create-tag-album-form"
				:confirm-label="t('dialogs.create_album.submit')"
				icon="lucide:tags"
				:loading="create.isPending.value"
				:disabled="!title.trim() || tags.length === 0"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { client } from "@/api/client.ts";
import DialogActions from "./DialogActions.vue";
import TagInput from "./TagInput.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const router = useRouter();
const title = ref("");
const tags = ref<string[]>([]);
const logic = ref<"or" | "and">("or");
const { open, close } = useDialog("createTagAlbum", () => {
	title.value = "";
	tags.value = [];
	logic.value = "or";
});
const logicItems = computed(() => [
	{ label: t("dialogs.tag_logic.or"), value: "or" },
	{ label: t("dialogs.tag_logic.and"), value: "and" },
]);

const create = useApiAction(
	(v: { title: string; tagNames: string[]; tagLogic: "or" | "and" }) =>
		client.albums.create({ ...v, parentId: null, kind: "tag" }),
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
	if (v && tags.value.length) create.mutate({ title: v, tagNames: tags.value, tagLogic: logic.value });
}
</script>
