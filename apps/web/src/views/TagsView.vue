<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16 flex flex-col gap-8">
		<PageHeading :title="t('nav.tags')">
			<UInput v-model="filter" icon="lucide:search" variant="soft" class="max-sm:w-full" :placeholder="t('tags.filter')" :aria-label="t('tags.filter')" />
		</PageHeading>
		<LoadingLine v-if="tags.isPending.value" />
		<UEmpty v-else-if="tags.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="tags.error.value?.message" />
		<UEmpty v-else-if="visible.length === 0" icon="lucide:tags" :title="t('tags.empty')" />
		<ul v-else class="flex flex-wrap gap-2">
			<li v-for="tag in visible" :key="tag.id">
				<UButton
					color="neutral"
					variant="soft"
					class="rounded-full ps-3.5 pe-2"
					:to="{ name: 'search', query: { q: searchTerm(tag.name) } }"
					:aria-label="t('tags.open', { name: tag.name, count: tag.count })"
				>
					<span class="font-serif text-[0.9375rem]">{{ tag.name }}</span>
					<span class="ms-2 text-xs text-muted tabular-nums">{{ tag.count }}</span>
				</UButton>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/api/query.ts";
import LoadingLine from "@/components/layout/LoadingLine.vue";
import PageHeading from "@/components/layout/PageHeading.vue";

const { t } = useI18n();
const filter = ref("");
const tags = useQuery(orpc.tags.list.queryOptions());
const visible = computed(() => {
	const f = filter.value.trim().toLowerCase();
	const list = tags.data.value ?? [];
	return (f ? list.filter((x) => x.name.toLowerCase().includes(f)) : list).toSorted((a, b) =>
		a.name.localeCompare(b.name),
	);
});

/** `tag:name`, quoted when the name contains whitespace. */
function searchTerm(name: string): string {
	return /\s/.test(name) ? `tag:"${name}"` : `tag:${name}`;
}
</script>
