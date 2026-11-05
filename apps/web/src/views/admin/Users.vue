<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16 flex flex-col gap-4">
		<PageHeading :title="t('nav.admin_users')">
			<UInput v-model="filter" icon="lucide:search" class="max-sm:w-full" :placeholder="t('users.filter')" :aria-label="t('users.filter')" />
			<UButton
				icon="lucide:refresh-cw"
				size="sm"
				color="neutral"
				variant="ghost"
				:loading="users.isFetching.value"
				:aria-label="t('admin.refresh')"
				@click="users.refetch()"
			/>
		</PageHeading>
		<p class="text-sm text-muted">{{ t("users.hint") }}</p>

		<LoadingLine v-if="users.isPending.value" />
		<UEmpty v-else-if="users.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="users.error.value?.message" />
		<UEmpty v-else-if="visible.length === 0" icon="lucide:users" :title="t('users.empty')" />
		<div v-else class="overflow-x-auto rounded-lg ring ring-default">
			<table class="w-full text-sm">
				<thead class="bg-elevated/50 text-start text-xs text-muted">
					<tr>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("users.cols.user") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("users.cols.email") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("users.cols.rights") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("users.cols.groups") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("users.cols.created") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("users.cols.last_login") }}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-default">
					<tr v-for="u in visible" :key="u.id" :data-user="u.username">
						<td class="px-3 py-2">
							<div class="font-medium text-highlighted">{{ u.displayName }}</div>
							<div class="text-xs text-dimmed">
								{{ u.username }} <span class="font-mono" :title="u.sub">#{{ u.id }}</span>
							</div>
						</td>
						<td class="px-3 py-2 text-muted">{{ u.email ?? "—" }}</td>
						<td class="px-3 py-2">
							<div class="flex flex-wrap gap-1">
								<UBadge v-if="u.isAdmin" size="sm" color="error" variant="soft" icon="lucide:shield">{{ t("users.admin") }}</UBadge>
								<UBadge v-if="u.mayUpload" size="sm" color="primary" variant="soft" icon="lucide:upload">{{ t("users.upload") }}</UBadge>
								<span v-if="!u.isAdmin && !u.mayUpload" class="text-xs text-dimmed">{{ t("users.viewer") }}</span>
							</div>
						</td>
						<td class="px-3 py-2">
							<div class="flex flex-wrap gap-1">
								<UBadge v-for="g in [...u.roles, ...u.groups]" :key="g" size="sm" color="neutral" variant="outline">{{ g }}</UBadge>
							</div>
						</td>
						<td class="px-3 py-2 text-muted whitespace-nowrap">{{ fmt(u.createdAt) }}</td>
						<td class="px-3 py-2 text-muted whitespace-nowrap">{{ u.lastLoginAt ? fmt(u.lastLoginAt) : t("users.never") }}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/api/query.ts";
import LoadingLine from "@/components/layout/LoadingLine.vue";
import PageHeading from "@/components/layout/PageHeading.vue";

const { t, locale } = useI18n();
const users = useQuery(orpc.users.list.queryOptions());
const filter = ref("");

const visible = computed(() => {
	const q = filter.value.trim().toLowerCase();
	const all = users.data.value ?? [];
	if (!q) return all;
	return all.filter((u) =>
		[u.username, u.displayName, u.email ?? "", ...u.groups, ...u.roles].some((s) =>
			s.toLowerCase().includes(q),
		),
	);
});

const fmt = (iso: string) =>
	new Date(iso).toLocaleString(locale.value, { dateStyle: "medium", timeStyle: "short" });
</script>
