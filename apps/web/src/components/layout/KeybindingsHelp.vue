<template>
	<UModal v-model:open="ui.dialogs.keybindings" :title="t('keys.title')">
		<template #body>
			<div class="flex flex-col gap-5">
				<section v-for="group in [{ title: t('keys.gallery'), rows }, { title: t('keys.lightbox'), rows: lightboxRows }]" :key="group.title">
					<h3 class="font-serif text-base text-highlighted mb-2">{{ group.title }}</h3>
					<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
						<template v-for="row in group.rows" :key="row.label">
							<dt class="flex gap-1">
								<UKbd v-for="k in row.keys" :key="k" :value="k" />
							</dt>
							<dd class="text-muted">{{ row.label }}</dd>
						</template>
					</dl>
				</section>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useUiStore } from "@/stores/ui.ts";

const { t } = useI18n();
const ui = useUiStore();

const rows = computed(() => [
	{ keys: ["/"], label: t("keys.search") },
	{ keys: ["meta", "a"], label: t("keys.select_all") },
	{ keys: ["esc"], label: t("keys.escape") },
	{ keys: ["u"], label: t("keys.upload") },
	{ keys: ["n"], label: t("keys.new_album") },
	{ keys: ["h"], label: t("keys.nsfw") },
	{ keys: ["?"], label: t("keys.help") },
]);
const lightboxRows = computed(() => [
	{ keys: ["←", "→"], label: t("keys.prev_next") },
	{ keys: ["space"], label: t("keys.slideshow") },
	{ keys: ["i"], label: t("keys.details") },
	{ keys: ["f"], label: t("keys.fullscreen") },
	{ keys: ["s"], label: t("keys.highlight") },
	{ keys: ["+", "-", "0"], label: t("keys.zoom") },
	{ keys: ["1", "…", "5"], label: t("keys.rate") },
]);
</script>
