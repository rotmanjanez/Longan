<template>
	<UModal v-model:open="open" :title="t('dialogs.protection.title')" :description="head?.title">
		<template #body>
			<p v-if="!head" class="text-sm text-muted">{{ t("app.loading") }}</p>
			<UAlert v-else-if="!head.protection" color="warning" variant="subtle" :description="t('errors.codes.FORBIDDEN')" />
			<form v-else id="protection-form" class="flex flex-col gap-4" @submit.prevent="submit">
				<USwitch v-model="form.isPublic" :label="t('dialogs.protection.public')" :description="t('dialogs.protection.public_hint')" />
				<div class="flex flex-col gap-3 ps-4 border-s-2 border-default" :class="form.isPublic ? '' : 'opacity-50'">
					<USwitch v-model="form.isLinkRequired" :disabled="!form.isPublic" :label="t('dialogs.protection.link_required')" :description="t('dialogs.protection.link_required_hint')" />
					<USwitch v-model="form.grantsFullPhotoAccess" :disabled="!form.isPublic" :label="t('sharing.grants.grantsFullPhotoAccess')" />
					<USwitch v-model="form.grantsDownload" :disabled="!form.isPublic" :label="t('sharing.grants.grantsDownload')" />
					<USwitch v-model="form.grantsUpload" :disabled="!form.isPublic" :label="t('sharing.grants.grantsUpload')" :description="t('dialogs.protection.upload_hint')" />
					<div class="flex flex-col gap-2">
						<p class="text-sm font-medium">{{ t("dialogs.protection.password") }}</p>
						<URadioGroup v-model="form.passwordMode" :items="passwordItems" :disabled="!form.isPublic" />
						<UInput
							v-if="form.passwordMode === 'set'"
							v-model="form.password"
							type="password"
							autocomplete="new-password"
							:placeholder="t('dialogs.protection.password_new')"
							:disabled="!form.isPublic"
							class="w-full"
						/>
					</div>
				</div>
				<USeparator />
				<USwitch v-model="form.isNsfw" :label="t('dialogs.fields.nsfw')" :description="t('dialogs.protection.nsfw_hint')" />
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="protection-form"
				:confirm-label="t('dialogs.save')"
				icon="lucide:check"
				:loading="save.isPending.value"
				:disabled="!head?.protection || (form.passwordMode === 'set' && !form.password)"
				@cancel="close"
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
import DialogActions from "./DialogActions.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

type Input = Parameters<typeof client.albums.setProtection>[0];

const { t } = useI18n();
const form = reactive({
	isPublic: false,
	isLinkRequired: false,
	isNsfw: false,
	grantsFullPhotoAccess: false,
	grantsDownload: false,
	grantsUpload: false,
	passwordMode: "keep" as "keep" | "set" | "remove",
	password: "",
});
const { open, ctx, close } = useDialog("albumProtection");
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
		Object.assign(form, { ...h.protection, isNsfw: h.isNsfw, passwordMode: "keep", password: "" });
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
	after: () => close(),
});

function submit() {
	const id = albumId.value;
	if (!id) return;
	const input: Input = {
		id,
		isPublic: form.isPublic,
		isLinkRequired: form.isPublic && form.isLinkRequired,
		isNsfw: form.isNsfw,
		grantsFullPhotoAccess: form.isPublic && form.grantsFullPhotoAccess,
		grantsDownload: form.isPublic && form.grantsDownload,
		grantsUpload: form.isPublic && form.grantsUpload,
	};
	if (form.passwordMode === "set" && form.password) input.password = form.password;
	if (form.passwordMode === "remove") input.password = null;
	save.mutate(input);
}
</script>
