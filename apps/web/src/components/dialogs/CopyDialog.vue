<template>
	<UModal v-model:open="open" :close="false" :title="t('dialogs.copy.title', ctx.photoIds.length)">
		<template #body>
			<form id="copy-form" class="flex flex-col gap-3" @submit.prevent="submit">
				<p class="text-sm text-muted">{{ t("dialogs.copy.hint") }}</p>
				<AlbumPicker v-model="target" :exclude-only="ctx.albumId ? [ctx.albumId] : []" :label="t('dialogs.move.target')" />
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="copy-form"
				:confirm-label="t('dialogs.copy.submit')"
				icon="lucide:copy"
				:loading="copy.isPending.value"
				:disabled="!target"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { useSelectionStore } from "@/stores/selection.ts";
import AlbumPicker from "./AlbumPicker.vue";
import DialogActions from "./DialogActions.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const selection = useSelectionStore();
const target = ref<string | null | undefined>(undefined);
const { open, ctx, close } = useDialog("copy", () => {
	target.value = undefined;
});

const copy = useApiAction((v: { ids: string[]; toAlbum: string }) => client.photos.copy(v), {
	invalidate: (v) => ({ photos: v.ids }),
	success: () => t("dialogs.copy.done"),
	after: () => {
		close();
		selection.clear();
	},
});

function submit() {
	if (target.value) copy.mutate({ ids: [...ctx.value.photoIds], toAlbum: target.value });
}
</script>
