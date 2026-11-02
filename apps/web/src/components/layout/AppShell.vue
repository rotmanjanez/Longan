<template>
	<div class="min-h-dvh flex flex-col">
		<AppHeader ref="headerRef" />
		<LeftMenu />
		<main class="flex-1 w-full">
			<RouterView />
		</main>
		<DialogHost />
	</div>
</template>

<script setup lang="ts">
import { defineShortcuts } from "@nuxt/ui/composables";
import { useTitle } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useInit } from "@/composables/useInit.ts";
import { applyTheme } from "@/lib/theme.ts";
import { useUiStore } from "@/stores/ui.ts";
import type AppHeader from "./AppHeader.vue";
import DialogHost from "./DialogHost.vue";
import LeftMenu from "./LeftMenu.vue";

const { t } = useI18n();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { config, rights } = useInit();
const headerRef = ref<InstanceType<typeof AppHeader> | null>(null);

watch(
	config,
	(c) => {
		applyTheme(c.theme);
		ui.darkDefault = c.darkModeDefault;
		if (ui.nsfwVisible === null) ui.nsfwVisible = c.nsfwVisibleByDefault;
	},
	{ immediate: true },
);

const routeTitle = computed(() => ui.pageTitle ?? (route.meta.title ? t(route.meta.title) : ""));
const title = useTitle();
watch(
	[routeTitle, () => config.value.title],
	([page, site]) => {
		title.value = page ? `${page} · ${site}` : site;
	},
	{ immediate: true },
);

defineShortcuts(
	computed(() => ({
		"/": () => {
			if (!rights.value.canUseSearch) return;
			if (headerRef.value && window.innerWidth >= 640) headerRef.value.focusSearch();
			else router.push({ name: "search" });
		},
		h: () => {
			ui.nsfwVisible = !ui.nsfwVisible;
		},
		"?": () => ui.openDialog("keybindings"),
	})),
);
</script>
