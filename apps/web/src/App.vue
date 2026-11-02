<template>
	<UApp :toaster="{ position: 'bottom-right' }" :tooltip="{ delayDuration: 400 }">
		<AppShell v-if="init.data.value" />
		<LoadingScreen v-else :error="init.error.value" :loading="init.isFetching.value" @retry="init.refetch()" />
	</UApp>
</template>

<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables";
import { useQuery } from "@tanstack/vue-query";
import { watchEffect } from "vue";
import { configureErrorHandling } from "@/api/errors.ts";
import AppShell from "@/components/layout/AppShell.vue";
import LoadingScreen from "@/components/layout/LoadingScreen.vue";
import { initQueryOptions } from "@/composables/useInit.ts";
import { tOr } from "@/i18n/index.ts";
import { router } from "@/router/index.ts";
import { useUiStore } from "@/stores/ui.ts";

const ui = useUiStore();
const toast = useToast();

configureErrorHandling({
	toast: (t) => toast.add({ ...t, icon: "lucide:triangle-alert" }),
	currentPath: () => router.currentRoute.value.fullPath,
	currentAlbumId: () => {
		const id = router.currentRoute.value.params.albumId;
		return typeof id === "string" ? id : null;
	},
	openUnlock: (id) => ui.openUnlock(id),
	translate: tOr,
});

const init = useQuery(initQueryOptions());

watchEffect(() => {
	document.documentElement.classList.toggle("dark", ui.isDark);
});
</script>
