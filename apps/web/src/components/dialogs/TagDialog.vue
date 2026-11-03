<template>
	<UModal v-model:open="open" :close="false" :title="t('dialogs.tags.title', ctx.photoIds.length)">
		<template #body>
			<form id="tag-form" class="flex flex-col gap-4" @submit.prevent="submit">
				<div v-if="current.length">
					<p class="text-sm font-medium mb-2">{{ t("dialogs.tags.current") }}</p>
					<div class="flex flex-wrap gap-1.5">
						<UBadge
							v-for="tag in current"
							:key="tag.id"
							:color="removed.has(tag.id) ? 'error' : 'neutral'"
							size="lg"
							variant="soft"
							:class="removed.has(tag.id) ? 'line-through' : ''"
						>
							{{ tag.name }}
							<span v-if="ctx.photoIds.length > 1" class="text-muted">({{ tag.count }}/{{ ctx.photoIds.length }})</span>
							<button
								type="button"
								class="-me-1 p-1 pointer-coarse:p-1.5 rounded-sm hover:text-error focus-visible:outline-2 focus-visible:outline-primary"
								:aria-label="t(removed.has(tag.id) ? 'dialogs.tags.keep' : 'dialogs.tags.remove', { name: tag.name })"
								@click="toggleRemove(tag.id)"
							>
								<UIcon :name="removed.has(tag.id) ? 'lucide:undo-2' : 'lucide:x'" class="size-3.5" />
							</button>
						</UBadge>
					</div>
				</div>
				<p v-else-if="loading" class="text-sm text-muted">{{ t("app.loading") }}</p>
				<UFormField :label="t('dialogs.tags.add')">
					<TagInput v-model="added" />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="tag-form"
				:confirm-label="t('dialogs.tags.submit')"
				icon="lucide:tag"
				:loading="apply.isPending.value"
				:disabled="added.length === 0 && removed.size === 0"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { usePhotoDetails } from "@/composables/usePhotoDetails.ts";
import { useSelectionStore } from "@/stores/selection.ts";
import DialogActions from "./DialogActions.vue";
import TagInput from "./TagInput.vue";
import { useAlbumCtx, useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const selection = useSelectionStore();
const albumCtx = useAlbumCtx();
const added = ref<string[]>([]);
const removed = ref(new Set<number>());
const { open, ctx, close } = useDialog("tag", () => {
	added.value = [];
	removed.value = new Set();
});

const ids = computed(() => (open.value ? ctx.value.photoIds : []));
const { details, loading } = usePhotoDetails(albumCtx, ids);
/** Union of the selected photos' tags with how many photos carry each. */
const current = computed(() => {
	const counts = new Map<number, { id: number; name: string; count: number }>();
	for (const id of ids.value) {
		for (const tag of details.value.get(id)?.tags ?? []) {
			const c = counts.get(tag.id) ?? { ...tag, count: 0 };
			c.count++;
			counts.set(tag.id, c);
		}
	}
	return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
});

function toggleRemove(id: number) {
	const next = new Set(removed.value);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	removed.value = next;
}

const apply = useApiAction(
	async (v: { photoIds: string[]; names: string[]; tagIds: number[] }) => {
		if (v.names.length) await client.tags.attach({ photoIds: v.photoIds, names: v.names });
		if (v.tagIds.length) await client.tags.detach({ photoIds: v.photoIds, tagIds: v.tagIds });
	},
	{
		invalidate: (v) => ({ photos: v.photoIds, tags: true }),
		success: () => t("dialogs.tags.done"),
		after: () => {
			close();
			selection.clear();
		},
	},
);

function submit() {
	apply.mutate({ photoIds: [...ctx.value.photoIds], names: [...added.value], tagIds: [...removed.value] });
}
</script>
