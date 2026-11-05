<template>
	<USlideover
		v-model:open="ui.leftMenuOpen"
		side="left"
		:title="config.title"
		:description="t('app.version', { version: config.version })"
		:ui="{ content: 'max-w-xs', header: 'pt-8 pb-4', body: 'p-3 sm:p-3' }"
	>
		<template #body>
			<nav :aria-label="t('nav.main')">
				<UNavigationMenu
					orientation="vertical"
					:items="items"
					:ui="{
						link: 'text-[0.9375rem] py-2 rounded-md',
						linkLeadingIcon: 'size-4.5',
						label: 'font-serif text-xs tracking-wide text-dimmed px-2.5 pt-5',
					}"
				/>
			</nav>
		</template>
	</USlideover>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useInit } from "@/composables/useInit.ts";
import { useUiStore } from "@/stores/ui.ts";

const { t } = useI18n();
const ui = useUiStore();
const route = useRoute();
const { config, rights, user } = useInit();

watch(
	() => route.fullPath,
	() => {
		ui.leftMenuOpen = false;
	},
);

const items = computed<NavigationMenuItem[][]>(() => {
	const r = rights.value;
	const f = config.value.features;
	const gallery: NavigationMenuItem[] = [{ label: t("nav.gallery"), icon: "lucide:images", to: "/" }];
	if (r.canUseTimeline && f.timeline)
		gallery.push({ label: t("nav.timeline"), icon: "lucide:calendar-range", to: "/timeline" });
	if (r.canUseMap && f.map) gallery.push({ label: t("nav.map"), icon: "lucide:map", to: "/map" });
	if (r.canUseSearch && f.search)
		gallery.push({ label: t("nav.search"), icon: "lucide:search", to: "/search" });
	if (user.value) gallery.push({ label: t("nav.tags"), icon: "lucide:tags", to: "/tags" });
	if (user.value && (r.mayUpload || r.isAdmin))
		gallery.push({ label: t("nav.sharing"), icon: "lucide:share-2", to: "/sharing" });
	const groups: NavigationMenuItem[][] = [gallery];
	if (r.isAdmin) {
		groups.push([
			{ label: t("nav.admin"), type: "label" },
			{ label: t("nav.admin_settings"), icon: "lucide:settings", to: "/admin/settings" },
			{ label: t("nav.admin_users"), icon: "lucide:users", to: "/admin/users" },
			{ label: t("nav.admin_jobs"), icon: "lucide:list-checks", to: "/admin/jobs" },
			{ label: t("nav.admin_health"), icon: "lucide:activity", to: "/admin/health" },
		]);
	}
	return groups;
});
</script>
