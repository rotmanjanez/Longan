<template>
	<UModal v-model:open="ui.dialogs.keybindings" :title="t('keys.title')">
		<template #body>
			<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
				<template v-for="row in rows" :key="row.label">
					<dt class="flex gap-1">
						<UKbd v-for="k in row.keys" :key="k" :value="k" />
					</dt>
					<dd class="text-muted">{{ row.label }}</dd>
				</template>
			</dl>
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
	{ keys: ["←", "→"], label: t("keys.prev_next") },
	{ keys: ["h"], label: t("keys.nsfw") },
	{ keys: ["?"], label: t("keys.help") },
]);
</script>
