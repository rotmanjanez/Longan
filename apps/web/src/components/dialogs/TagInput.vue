<template>
	<UInputMenu
		v-model="model"
		:items="items"
		multiple
		create-item
		icon="lucide:tag"
		:placeholder="placeholder ?? t('dialogs.tags.placeholder')"
		class="w-full"
		@create="onCreate"
	/>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/api/query.ts";

/** Tag names editor with autocomplete from `tags.list`; new names can be typed and created. */
const model = defineModel<string[]>({ required: true });
defineProps<{ placeholder?: string }>();
const { t } = useI18n();

const tags = useQuery(orpc.tags.list.queryOptions({ meta: { silentError: true } }));
const items = computed(() => {
	const names = new Set((tags.data.value ?? []).map((tag) => tag.name));
	for (const n of model.value) names.add(n);
	return [...names].sort((a, b) => a.localeCompare(b));
});

function onCreate(name: string) {
	const v = name.trim();
	if (v && !model.value.includes(v)) model.value = [...model.value, v];
}
</script>
