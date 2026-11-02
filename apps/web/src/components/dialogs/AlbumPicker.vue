<template>
	<div class="flex flex-col gap-2">
		<UInput v-model="filter" icon="lucide:search" :placeholder="t('dialogs.picker.filter')" class="w-full" autofocus />
		<div
			class="max-h-72 overflow-y-auto rounded-md ring ring-default divide-y divide-default"
			role="listbox"
			:aria-label="label ?? t('dialogs.picker.label')"
		>
			<p v-if="tree.isPending.value" class="p-3 text-sm text-muted">{{ t("app.loading") }}</p>
			<button
				v-if="allowRoot && !filter"
				type="button"
				role="option"
				:aria-selected="modelValue === null"
				class="w-full flex items-center gap-2 px-3 py-2 text-start text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
				:class="modelValue === null ? 'bg-primary/10 text-primary' : ''"
				@click="emit('update:modelValue', null)"
			>
				<UIcon name="lucide:house" class="size-4 shrink-0" />
				{{ t("dialogs.picker.root") }}
			</button>
			<button
				v-for="row in rows"
				:key="row.id"
				type="button"
				role="option"
				:aria-selected="modelValue === row.id"
				:data-album-option="row.id"
				class="w-full flex items-center gap-2 px-3 py-2 text-start text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
				:class="modelValue === row.id ? 'bg-primary/10 text-primary' : ''"
				:style="{ paddingInlineStart: `${0.75 + (filter ? 0 : row.depth) * 1.25}rem` }"
				@click="emit('update:modelValue', row.id)"
			>
				<UIcon name="lucide:folder" class="size-4 shrink-0" />
				<span class="truncate">{{ row.title }}</span>
			</button>
			<p v-if="!tree.isPending.value && rows.length === 0 && !(allowRoot && !filter)" class="p-3 text-sm text-muted">
				{{ t("dialogs.picker.empty") }}
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/api/query.ts";
import { flattenTree, withDescendants } from "@/lib/options.ts";

/**
 * Target album picker over `albums.tree` (albums the viewer may edit). `exclude` removes albums and their
 * descendants (an album cannot move into itself). `null` = top level (when `allowRoot`).
 */
const props = defineProps<{
	modelValue: string | null | undefined;
	exclude?: readonly string[];
	/** Also exclude these ids, but not their descendants (e.g. the source album of a photo move). */
	excludeOnly?: readonly string[];
	allowRoot?: boolean;
	label?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();
const { t } = useI18n();
const filter = ref("");

const tree = useQuery(orpc.albums.tree.queryOptions({ staleTime: 0 }));
const rows = computed(() => {
	const data = tree.data.value;
	if (!data) return [];
	const hidden = withDescendants(data, props.exclude ?? []);
	for (const id of props.excludeOnly ?? []) hidden.add(id);
	const q = filter.value.trim().toLowerCase();
	return flattenTree(data).filter((r) => !hidden.has(r.id) && (!q || r.title.toLowerCase().includes(q)));
});
</script>
