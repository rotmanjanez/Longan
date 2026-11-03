<template>
	<UModal v-model:open="open" :close="false" :title="t('dialogs.merge.title', ctx.albumIds.length)">
		<template #body>
			<form id="merge-form" class="flex flex-col gap-3" @submit.prevent="submit">
				<p class="text-sm text-muted">{{ t("dialogs.merge.hint", ctx.albumIds.length) }}</p>
				<AlbumPicker v-model="target" :exclude="ctx.albumIds" :label="t('dialogs.merge.target')" />
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="merge-form"
				:confirm-label="t('dialogs.merge.submit')"
				icon="lucide:merge"
				:loading="merge.isPending.value"
				:disabled="!target"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { client } from "@/api/client.ts";
import { useSelectionStore } from "@/stores/selection.ts";
import AlbumPicker from "./AlbumPicker.vue";
import DialogActions from "./DialogActions.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const selection = useSelectionStore();
const target = ref<string | null | undefined>(undefined);
const { open, ctx, close } = useDialog("merge", () => {
	target.value = undefined;
});

const merge = useApiAction((v: { ids: string[]; targetId: string }) => client.albums.merge(v), {
	invalidate: () => ({ albums: true, photos: true }),
	success: () => t("dialogs.merge.done"),
	after: async (v) => {
		close();
		selection.clear();
		const current = route.params.albumId;
		if (typeof current === "string" && v.ids.includes(current)) {
			await router.replace({ name: "album", params: { albumId: v.targetId } });
		}
	},
});

function submit() {
	if (target.value) merge.mutate({ ids: [...ctx.value.albumIds], targetId: target.value });
}
</script>
