<template>
	<UModal v-model:open="open" :title="t('dialogs.photo_edit.title')" :ui="{ content: 'sm:max-w-xl' }">
		<template #body>
			<p v-if="!photo" class="text-sm text-muted">{{ t("app.loading") }}</p>
			<form v-else id="photo-edit-form" class="flex flex-col gap-4" @submit.prevent="submit">
				<UFormField :label="t('dialogs.fields.title')">
					<UInput v-model="form.title" class="w-full" maxlength="300" autofocus />
				</UFormField>
				<UFormField :label="t('dialogs.fields.description')">
					<UTextarea v-model="form.description" class="w-full" :rows="4" autoresize />
				</UFormField>
				<div class="grid sm:grid-cols-2 gap-4">
					<UFormField :label="t('dialogs.fields.taken_at')" :hint="photo.takenAtTz ? `UTC${photo.takenAtTz}` : undefined">
						<UInput v-model="form.takenAt" type="datetime-local" class="w-full" />
					</UFormField>
					<UFormField :label="t('dialogs.fields.license')">
						<USelect v-model="form.license" :items="licenseItems" class="w-full" />
					</UFormField>
				</div>
				<UFormField :label="t('dialogs.fields.tags')">
					<TagInput v-model="form.tags" />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="photo-edit-form"
				:confirm-label="t('dialogs.save')"
				icon="lucide:check"
				:loading="save.isPending.value"
				:disabled="!photo"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import type { PhotoDetail } from "@longan/shared";
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { usePhotoDetails } from "@/composables/usePhotoDetails.ts";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format.ts";
import { DEFAULT_OPTION, LICENSES, licenseKey } from "@/lib/options.ts";
import DialogActions from "./DialogActions.vue";
import TagInput from "./TagInput.vue";
import { useAlbumCtx, useApiAction, useDialog } from "./useDialog.ts";

type Patch = Parameters<typeof client.photos.update>[0]["patch"];

const { t } = useI18n();
const albumCtx = useAlbumCtx();
const form = reactive({
	title: "",
	description: "",
	takenAt: "",
	license: DEFAULT_OPTION as string,
	tags: [] as string[],
});
const { open, ctx, close } = useDialog("photoEdit");

const id = computed(() => (open.value ? (ctx.value.photoIds[0] ?? null) : null));
const { details } = usePhotoDetails(albumCtx, () => (id.value ? [id.value] : []));
const photo = computed<PhotoDetail | null>(() => (id.value ? (details.value.get(id.value) ?? null) : null));

watch(
	() => [open.value, photo.value?.id] as const,
	([isOpen]) => {
		const p = photo.value;
		if (!isOpen || !p) return;
		form.title = p.title;
		form.description = p.description ?? "";
		form.takenAt = toDatetimeLocal(p.takenAt);
		form.license = p.license ?? DEFAULT_OPTION;
		form.tags = p.tags.map((tag) => tag.name);
	},
	{ immediate: true },
);

const licenseItems = computed(() => [
	{ label: t("dialogs.default"), value: DEFAULT_OPTION },
	...LICENSES.map((l) => ({ label: t(licenseKey(l)), value: l })),
]);

const save = useApiAction(
	(v: { id: string; patch: Patch }) => client.photos.update({ ids: [v.id], patch: v.patch }),
	{
		invalidate: (v) => ({ photos: [v.id], tags: v.patch.tagNames !== undefined }),
		success: () => t("dialogs.photo_edit.done"),
		after: () => close(),
	},
);

function submit() {
	const p = photo.value;
	if (!p) return;
	const patch: Patch = {};
	if (form.title !== p.title) patch.title = form.title.trim();
	const desc = form.description.trim() || null;
	if (desc !== (p.description ?? null)) patch.description = desc;
	if (form.takenAt !== toDatetimeLocal(p.takenAt)) patch.takenAt = fromDatetimeLocal(form.takenAt);
	const license = form.license === DEFAULT_OPTION ? null : (form.license as Patch["license"]);
	if (license !== (p.license ?? null)) patch.license = license;
	const before = p.tags.map((tag) => tag.name).sort();
	const after = [...form.tags].sort();
	if (before.join("\u0000") !== after.join("\u0000")) patch.tagNames = form.tags;
	if (Object.keys(patch).length === 0) {
		close();
		return;
	}
	save.mutate({ id: p.id, patch });
}
</script>
