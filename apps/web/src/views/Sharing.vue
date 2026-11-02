<template>
	<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-4 max-w-5xl">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-lg font-bold text-highlighted flex-1">{{ t("nav.sharing") }}</h1>
			<UInput v-model="filter" icon="lucide:search" size="sm" :placeholder="t('sharing.filter')" :aria-label="t('sharing.filter')" />
		</div>
		<p class="text-sm text-muted">{{ t("sharing.page_hint") }}</p>

		<div v-if="list.isPending.value" class="flex justify-center py-16 text-muted" role="status">
			<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
			<span class="sr-only">{{ t("app.loading") }}</span>
		</div>
		<UEmpty v-else-if="list.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="list.error.value?.message" />
		<UEmpty
			v-else-if="groups.length === 0"
			icon="lucide:share-2"
			:title="filter ? t('sharing.no_match') : t('sharing.empty')"
			:description="filter ? undefined : t('sharing.empty_hint')"
		/>
		<section
			v-for="g in groups"
			v-else
			:key="g.albumId"
			class="rounded-xl ring ring-default"
			:aria-label="g.albumTitle"
			:data-share-album="g.albumId"
		>
			<header class="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-default">
				<UIcon name="lucide:folder" class="size-4 text-muted" />
				<RouterLink
					:to="{ name: 'album', params: { albumId: g.albumId } }"
					class="font-semibold text-highlighted hover:underline flex-1 min-w-0 truncate"
				>
					{{ g.albumTitle }}
				</RouterLink>
				<UBadge size="sm" color="neutral" variant="soft">{{ t("sharing.user_count", g.rows.length) }}</UBadge>
				<UButton
					size="xs"
					color="neutral"
					variant="ghost"
					icon="lucide:user-plus"
					@click="ui.openDialog('share', { albumId: g.albumId, photoIds: [], albumIds: [g.albumId] })"
				>
					{{ t("sharing.manage") }}
				</UButton>
			</header>
			<ul class="divide-y divide-default">
				<li
					v-for="row in g.rows"
					:key="row.id"
					class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
					:data-share="row.id"
				>
					<div class="min-w-40 flex-1">
						<div class="text-sm font-medium text-default">{{ row.user.displayName }}</div>
						<div class="text-xs text-dimmed">{{ row.user.username }}</div>
					</div>
					<GrantCheckboxes
						:model-value="pickGrants(row)"
						:label="row.user.displayName"
						:disabled="busy.has(row.id)"
						@update:model-value="(grants: ShareGrants) => onUpdate(row.id, grants)"
					/>
					<UButton
						size="xs"
						color="error"
						variant="ghost"
						icon="lucide:user-minus"
						:loading="remove.isPending.value && remove.variables.value?.ids.includes(row.id)"
						:aria-label="t('sharing.remove', { name: row.user.displayName, album: g.albumTitle })"
						@click="remove.mutate({ ids: [row.id] })"
					/>
				</li>
			</ul>
		</section>
	</div>
</template>

<script setup lang="ts">
import type { ShareGrants } from "@longan/shared";
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";
import GrantCheckboxes from "@/components/dialogs/GrantCheckboxes.vue";
import { pickGrants } from "@/components/dialogs/grants.ts";
import { useApiAction } from "@/components/dialogs/useDialog.ts";
import { useUiStore } from "@/stores/ui.ts";

const { t } = useI18n();
const ui = useUiStore();
const list = useQuery(orpc.sharing.listAll.queryOptions());
const filter = ref("");

type Row = NonNullable<typeof list.data.value>[number];

const groups = computed(() => {
	const q = filter.value.trim().toLowerCase();
	const byAlbum = new Map<string, { albumId: string; albumTitle: string; rows: Row[] }>();
	for (const r of list.data.value ?? []) {
		if (q && ![r.albumTitle, r.user.displayName, r.user.username].some((s) => s.toLowerCase().includes(q)))
			continue;
		let g = byAlbum.get(r.albumId);
		if (!g) {
			g = { albumId: r.albumId, albumTitle: r.albumTitle, rows: [] };
			byAlbum.set(r.albumId, g);
		}
		g.rows.push(r);
	}
	return [...byAlbum.values()].sort((a, b) => a.albumTitle.localeCompare(b.albumTitle));
});

const busy = ref(new Set<number>());
const update = useApiAction((v: { id: number; grants: ShareGrants }) => client.sharing.update(v), {
	success: () => t("sharing.updated"),
	invalidate: () => ({ sharing: true }),
});
function onUpdate(id: number, grants: ShareGrants) {
	busy.value = new Set(busy.value).add(id);
	update.mutate(
		{ id, grants },
		{
			onSettled: () => {
				const next = new Set(busy.value);
				next.delete(id);
				busy.value = next;
			},
		},
	);
}

const remove = useApiAction((v: { ids: number[] }) => client.sharing.remove(v), {
	success: () => t("sharing.removed"),
	invalidate: () => ({ sharing: true }),
});
</script>
