<template>
	<UModal
		:close="false"
		:open="ui.unlockAlbumId !== null"
		:title="t('dialogs.unlock.title')"
		:description="t('dialogs.unlock.description')"
		@update:open="(o: boolean) => !o && cancel()"
	>
		<template #body>
			<form id="unlock-form" class="flex flex-col gap-3" @submit.prevent="submit">
				<UFormField :label="t('dialogs.unlock.password')" :error="errorText || undefined">
					<UInput v-model="password" type="password" autocomplete="current-password" autofocus class="w-full" />
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="unlock-form"
				:confirm-label="t('dialogs.unlock.submit')"
				icon="lucide:lock-open"
				:loading="pending"
				:disabled="password.length === 0"
				@cancel="cancel"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { client } from "@/api/client.ts";
import { errorCode } from "@/api/errors.ts";
import DialogActions from "@/components/dialogs/DialogActions.vue";
import { useUiStore } from "@/stores/ui.ts";

const { t } = useI18n();
const ui = useUiStore();
const queryClient = useQueryClient();
const router = useRouter();

const password = ref("");
const pending = ref(false);
const errorText = ref("");

watch(
	() => ui.unlockAlbumId,
	() => {
		password.value = "";
		errorText.value = "";
	},
);

function cancel() {
	ui.closeUnlock();
	// Leaving the locked album: nothing to show there.
	if (router.currentRoute.value.name === "album" && window.history.length > 1) router.back();
}

async function submit() {
	const id = ui.unlockAlbumId;
	if (!id || !password.value) return;
	pending.value = true;
	errorText.value = "";
	try {
		await client.albums.unlock({ id, password: password.value });
		ui.closeUnlock();
		await queryClient.invalidateQueries();
	} catch (e) {
		const code = errorCode(e);
		errorText.value =
			code === "FORBIDDEN" || code === "BAD_REQUEST" || code === "PASSWORD_REQUIRED"
				? t("dialogs.unlock.wrong")
				: e instanceof Error
					? e.message
					: String(e);
	} finally {
		pending.value = false;
	}
}
</script>
