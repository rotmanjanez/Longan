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
	<UButton v-else color="neutral" variant="ghost" icon="lucide:log-in" :href="login" external :aria-label="t('user.sign_in')">
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

/**
 * `POST /auth/logout` as JSON: the server ends the session and answers `{ redirect }` (the IdP end-session
 * URL); navigating there from here works whichever origin serves the SPA (APP_URL or the Vite dev server).
 */
async function logout() {
	let target = "/";
	try {
		const back = encodeURIComponent(`${window.location.origin}/`);
		const res = await fetch(`/auth/logout?redirect=${back}`, {
			method: "POST",
			headers: { Accept: "application/json" },
		});
		const body = (await res.json()) as { redirect?: string };
		if (typeof body.redirect === "string") target = body.redirect;
	} catch {
		// session cookie is cleared server-side even if the body is unreadable
	}
	window.location.assign(target);
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
