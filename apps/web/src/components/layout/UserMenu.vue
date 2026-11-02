<template>
	<UDropdownMenu v-if="user" :items="items" :content="{ align: 'end' }">
		<UButton
			color="neutral"
			variant="ghost"
			icon="lucide:user"
			:label="user.displayName || user.username"
			:ui="{ label: 'hidden md:inline' }"
			:aria-label="t('user.menu')"
		/>
	</UDropdownMenu>
	<UButton v-else color="neutral" variant="ghost" icon="lucide:log-in" :href="login" :aria-label="t('user.sign_in')">
		<span class="hidden sm:inline">{{ t("user.sign_in") }}</span>
	</UButton>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { loginUrl } from "@/api/errors.ts";
import { useInit } from "@/composables/useInit.ts";
import { useUiStore } from "@/stores/ui.ts";

const { t } = useI18n();
const route = useRoute();
const ui = useUiStore();
const { user, rights } = useInit();

const login = computed(() => loginUrl(route.fullPath));

/** `POST /auth/logout` as a real form submit so the server can redirect to the IdP end-session endpoint. */
function logout() {
	const form = document.createElement("form");
	form.method = "POST";
	form.action = "/auth/logout";
	document.body.appendChild(form);
	form.submit();
}

const items = computed<DropdownMenuItem[][]>(() => {
	const u = user.value;
	const groups: DropdownMenuItem[][] = [
		[{ type: "label", label: u?.displayName || u?.username, description: u?.email ?? undefined }],
	];
	const tools: DropdownMenuItem[] = [];
	if (rights.value.mayUpload) {
		tools.push({ label: t("nav.sharing"), icon: "lucide:share-2", to: "/sharing" });
	}
	tools.push({
		label: t("keys.title"),
		icon: "lucide:keyboard",
		onSelect: () => ui.openDialog("keybindings"),
	});
	groups.push(tools);
	groups.push([{ label: t("user.sign_out"), icon: "lucide:log-out", onSelect: logout }]);
	return groups;
});
</script>
