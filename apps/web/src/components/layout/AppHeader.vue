<template>
	<header
		class="sticky top-0 z-40 box-content h-(--ui-header-height) pt-[env(safe-area-inset-top)] flex items-center gap-1 px-2 sm:px-5 bg-default/85 backdrop-blur-md transition-shadow duration-300"
		:class="scrolled ? 'shadow-[0_1px_0_0_var(--ui-border)]' : ''"
	>
		<UButton
			icon="lucide:menu"
			color="neutral"
			variant="ghost"
			:aria-label="t('nav.open_menu')"
			@click="ui.leftMenuOpen = true"
		/>
		<div class="relative min-w-0 flex items-center h-full ps-1 sm:ps-2">
			<RouterLink
				to="/"
				class="display text-[1.375rem] text-highlighted truncate max-w-[40vw] sm:max-w-xs transition-opacity duration-300"
				:class="showPageTitle ? 'opacity-0 pointer-events-none' : 'opacity-100'"
				:tabindex="showPageTitle ? -1 : undefined"
			>
				{{ config.title }}
			</RouterLink>
			<!-- The page heading is further down the page: name it here once it has scrolled away. -->
			<p
				v-if="ui.pageTitle"
				class="absolute inset-y-0 start-1 sm:start-2 flex items-center display text-lg text-highlighted truncate max-w-[50vw] sm:max-w-sm transition-opacity duration-300"
				:class="showPageTitle ? 'opacity-100' : 'opacity-0 pointer-events-none'"
				aria-hidden="true"
			>
				{{ ui.pageTitle }}
			</p>
		</div>
		<div class="flex-1 flex justify-center px-2">
			<SearchBox v-if="canSearch" ref="searchRef" class="hidden sm:block max-w-sm" />
		</div>
		<UButton
			v-if="canSearch"
			class="sm:hidden"
			icon="lucide:search"
			color="neutral"
			variant="ghost"
			to="/search"
			:aria-label="t('search.label')"
		/>
		<UButton
			:icon="ui.isDark ? 'lucide:sun' : 'lucide:moon'"
			color="neutral"
			variant="ghost"
			:aria-label="ui.isDark ? t('app.light_mode') : t('app.dark_mode')"
			@click="ui.toggleDark()"
		/>
		<UserMenu />
	</header>
</template>

<script setup lang="ts">
import { useWindowScroll } from "@vueuse/core";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useInit } from "@/composables/useInit.ts";
import { useUiStore } from "@/stores/ui.ts";
import SearchBox from "./SearchBox.vue";
import UserMenu from "./UserMenu.vue";

const { t } = useI18n();
const ui = useUiStore();
const { config, rights } = useInit();
const canSearch = computed(() => rights.value.canUseSearch && config.value.features.search);
const searchRef = ref<InstanceType<typeof SearchBox> | null>(null);
const { y } = useWindowScroll();
const scrolled = computed(() => y.value > 4);
const showPageTitle = computed(() => !!ui.pageTitle && !ui.pageTitleInView);

defineExpose({ focusSearch: () => searchRef.value?.focus() });
</script>
