<template>
	<UApp
		:toaster="{ position: phone ? 'top-center' : 'bottom-right', expand: false, progress: false, max: 3, duration: 4000 }"
		:tooltip="{ delayDuration: 400 }"
	>
		<AppShell v-if="init.data.value" />
		<LoadingScreen v-else :error="init.error.value" :loading="init.isFetching.value" @retry="init.refetch()" />
	</UApp>
</template>

<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables";
import { useQuery } from "@tanstack/vue-query";
import { useEventListener, useMediaQuery } from "@vueuse/core";
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

/**
 * Touch screens: dialogs must not focus their first field on open, which pops up the on-screen keyboard
 * (and on phones covers half of the bottom sheet). Focus the dialog itself instead, as reka does when a
 * dialog has no focusable field. Captured on document because reka's event does not bubble.
 */
const touchOnly = useMediaQuery("(hover: none) and (pointer: coarse)");
useEventListener(
	document,
	"focusScope.autoFocusOnMount",
	(e: Event) => {
		const el = e.target as HTMLElement;
		if (!touchOnly.value || el.getAttribute("role") !== "dialog") return;
		e.preventDefault();
		el.focus({ preventScroll: true });
	},
	{ capture: true },
);

/** Phones: toasts at the top, clear of bottom sheets, the upload pill and the lightbox caption. */
const phone = useMediaQuery("(max-width: 639px)");

/** Resolves any CSS color (Nuxt UI uses oklch) to rgb, which every browser accepts in theme-color. */
function toRgb(color: string): string {
	const ctx = document.createElement("canvas").getContext("2d");
	if (!ctx) return color;
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return `rgb(${r} ${g} ${b})`;
}

watchEffect(() => {
	document.documentElement.classList.toggle("dark", ui.isDark);
	// Browser chrome (Android toolbar, iOS status bar) follows the app's own light/dark choice.
	const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (meta) meta.content = toRgb(getComputedStyle(document.body).backgroundColor);
});
</script>
