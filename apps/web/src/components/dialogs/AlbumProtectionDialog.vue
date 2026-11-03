<template>
	<UModal v-model:open="open" :close="false" :title="t('dialogs.protection.title')" :description="head?.title">
		<template #body>
			<p v-if="!head" class="text-sm text-muted">{{ t("app.loading") }}</p>
			<UAlert v-else-if="!head.protection" color="warning" variant="subtle" :description="t('errors.codes.FORBIDDEN')" />
			<form v-else id="protection-form" class="flex flex-col gap-4" @submit.prevent="submit">
				<p class="text-sm text-muted">{{ t("dialogs.protection.intro") }}</p>
				<USwitch v-model="form.grantsFullPhotoAccess" :label="t('sharing.grants.grantsFullPhotoAccess')" />
				<USwitch v-model="form.grantsDownload" :label="t('sharing.grants.grantsDownload')" />
				<USwitch v-model="form.grantsUpload" :label="t('sharing.grants.grantsUpload')" :description="t('dialogs.protection.upload_hint')" />
				<UFormField :label="t('dialogs.protection.password')">
					<USelect v-model="form.passwordMode" :items="passwordItems" class="w-full" />
					<UInput
						v-if="form.passwordMode === 'set'"
						v-model="form.password"
						type="password"
						autocomplete="new-password"
						:placeholder="t('dialogs.protection.password_new')"
						class="w-full mt-2"
					/>
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="protection-form"
				:confirm-label="t('dialogs.save')"
				icon="lucide:check"
				:loading="save.isPending.value"
				:disabled="!head?.protection || (form.passwordMode === 'set' && !form.password)"
				@cancel="back"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";
import { useUiStore } from "@/stores/ui.ts";
import DialogActions from "./DialogActions.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

type Input = Parameters<typeof client.albums.setProtection>[0];

const { t } = useI18n();
const form = reactive({
	grantsFullPhotoAccess: false,
	grantsDownload: false,
	grantsUpload: false,
	passwordMode: "keep" as "keep" | "set" | "remove",
	password: "",
});
const ui = useUiStore();
const { open, ctx } = useDialog("albumProtection");
const albumId = computed(() => ctx.value.albumIds[0] ?? ctx.value.albumId);
const headQuery = useQuery(
	computed(() =>
		orpc.albums.head.queryOptions({
			input: { id: albumId.value ?? "" },
			enabled: open.value && !!albumId.value,
		}),
	),
);
const head = computed(() => (open.value ? headQuery.data.value : undefined));

watch(
	() => [open.value, head.value] as const,
	([isOpen, h]) => {
		if (!isOpen || !h?.protection) return;
		const p = h.protection;
		Object.assign(form, {
			grantsFullPhotoAccess: p.grantsFullPhotoAccess,
			grantsDownload: p.grantsDownload,
			grantsUpload: p.grantsUpload,
			passwordMode: "keep",
			password: "",
		});
	},
	{ immediate: true },
);

const passwordItems = computed(() => {
	const has = !!head.value?.protection?.hasPassword;
	return [
		{
			label: t(has ? "dialogs.protection.password_keep" : "dialogs.protection.password_none"),
			value: "keep",
		},
		{
			label: t(has ? "dialogs.protection.password_change" : "dialogs.protection.password_set"),
			value: "set",
		},
		...(has ? [{ label: t("dialogs.protection.password_remove"), value: "remove" }] : []),
	];
});

const save = useApiAction((v: Input) => client.albums.setProtection(v), {
	invalidate: () => ({ albums: true }),
	success: () => t("dialogs.protection.done"),
	after: () => back(),
});

/** Opened from the Share dialog, so both Save and Cancel return there. */
function back() {
	const id = albumId.value;
	ui.closeDialog("albumProtection");
	if (id) ui.openDialog("share", { albumId: id, albumIds: [id] });
}

function submit() {
	const h = head.value;
	if (!h?.protection) return;
	// Only the visitor options change here; who can open the album is picked in the Share dialog.
	const input: Input = {
		id: h.id,
		isPublic: h.protection.isPublic,
		isLinkRequired: h.protection.isLinkRequired,
		isNsfw: h.isNsfw,
		grantsFullPhotoAccess: form.grantsFullPhotoAccess,
		grantsDownload: form.grantsDownload,
		grantsUpload: form.grantsUpload,
	};
	if (form.passwordMode === "set" && form.password) input.password = form.password;
	if (form.passwordMode === "remove") input.password = null;
	save.mutate(input);
}
</script>
