<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16 flex flex-col gap-6 max-w-2xl">
		<PageHeading :title="t('nav.sharing')">
			<UInput v-model="filter" icon="lucide:search" class="max-sm:w-full" :placeholder="t('sharing.filter')" :aria-label="t('sharing.filter')" />
		</PageHeading>
		<p class="text-sm text-muted">{{ t("sharing.page_hint") }}</p>

		<LoadingLine v-if="list.isPending.value" />
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
			class="flex flex-col"
			:aria-label="g.albumTitle"
			:data-share-album="g.albumId"
		>
			<header class="flex items-center gap-2 pb-1">
				<RouterLink
					:to="{ name: 'album', params: { albumId: g.albumId } }"
					class="font-serif text-lg text-highlighted hover:underline underline-offset-4 decoration-1 flex-1 min-w-0 truncate"
				>
					{{ g.albumTitle }}
				</RouterLink>
				<UButton
					color="neutral"
					variant="ghost"
					icon="lucide:user-plus"
					:aria-label="t('sharing.manage')"
					@click="ui.openDialog('share', { albumId: g.albumId, photoIds: [], albumIds: [g.albumId] })"
				/>
			</header>
			<ul>
				<li v-for="row in g.rows" :key="row.id" class="flex items-center gap-3 py-1.5" :data-share="row.id">
					<UAvatar :alt="row.user.displayName" size="md" />
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium truncate">{{ row.user.displayName }}</div>
						<div class="text-xs text-muted truncate">@{{ row.user.username }}</div>
					</div>
					<ShareRoleMenu
						:grants="pickGrants(row)"
						:name="row.user.displayName"
						:loading="busy.has(row.id)"
						@update="(grants) => onUpdate(row.id, grants)"
						@remove="onRemove(row.id)"
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
import { pickGrants } from "@/components/dialogs/grants.ts";
import ShareRoleMenu from "@/components/dialogs/ShareRoleMenu.vue";
import { useApiAction } from "@/components/dialogs/useDialog.ts";
import LoadingLine from "@/components/layout/LoadingLine.vue";
import PageHeading from "@/components/layout/PageHeading.vue";
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
function track(id: number) {
	busy.value = new Set(busy.value).add(id);
	return {
		onSettled: () => {
			const next = new Set(busy.value);
			next.delete(id);
			busy.value = next;
		},
	};
}
function onUpdate(id: number, grants: ShareGrants) {
	update.mutate({ id, grants }, track(id));
}
function onRemove(id: number) {
	remove.mutate({ ids: [id] }, track(id));
}

const remove = useApiAction((v: { ids: number[] }) => client.sharing.remove(v), {
	success: () => t("sharing.removed"),
	invalidate: () => ({ sharing: true }),
});
</script>
