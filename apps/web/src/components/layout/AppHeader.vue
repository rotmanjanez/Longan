<template>
	<header
		class="sticky top-0 z-40 h-(--ui-header-height) flex items-center gap-2 px-2 sm:px-4 bg-default/80 backdrop-blur border-b border-default"
	>
		<UButton
			icon="lucide:menu"
			color="neutral"
			variant="ghost"
			:aria-label="t('nav.open_menu')"
			@click="ui.leftMenuOpen = true"
		/>
		<RouterLink to="/" class="font-bold text-highlighted truncate max-w-[40vw] sm:max-w-xs">
			{{ config.title }}
		</RouterLink>
		<div class="flex-1 flex justify-center px-2">
			<SearchBox v-if="canSearch" ref="searchRef" class="hidden sm:block max-w-md" />
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
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useInit } from "@/composables/useInit.ts";
import { useUiStore } from "@/stores/ui.ts";
import type SearchBox from "./SearchBox.vue";
import UserMenu from "./UserMenu.vue";

const { t } = useI18n();
const ui = useUiStore();
const { config, rights } = useInit();
const canSearch = computed(() => rights.value.canUseSearch && config.value.features.search);
const searchRef = ref<InstanceType<typeof SearchBox> | null>(null);

defineExpose({ focusSearch: () => searchRef.value?.focus() });
</script>
