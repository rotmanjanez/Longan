<template>
	<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-lg font-bold text-highlighted flex-1">{{ t("nav.tags") }}</h1>
			<UInput v-model="filter" icon="lucide:search" class="max-sm:w-full" :placeholder="t('tags.filter')" :aria-label="t('tags.filter')" />
		</div>
		<div v-if="tags.isPending.value" class="flex justify-center py-16 text-muted" role="status">
			<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
			<span class="sr-only">{{ t("app.loading") }}</span>
		</div>
		<UEmpty v-else-if="tags.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="tags.error.value?.message" />
		<UEmpty v-else-if="visible.length === 0" icon="lucide:tags" :title="t('tags.empty')" />
		<ul v-else class="flex flex-wrap gap-2">
			<li v-for="tag in visible" :key="tag.id">
				<UButton
					color="neutral"
					variant="soft"
					icon="lucide:tag"
					:to="{ name: 'search', query: { q: searchTerm(tag.name) } }"
					:aria-label="t('tags.open', { name: tag.name, count: tag.count })"
				>
					{{ tag.name }}
					<UBadge color="neutral" variant="outline" size="sm" class="ms-1">{{ tag.count }}</UBadge>
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
