<template>
	<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-lg font-bold text-highlighted flex-1">{{ t("nav.admin_users") }}</h1>
			<UInput v-model="filter" icon="lucide:search" size="sm" :placeholder="t('users.filter')" :aria-label="t('users.filter')" />
			<UButton
				icon="lucide:refresh-cw"
				size="sm"
				color="neutral"
				variant="ghost"
				:loading="users.isFetching.value"
				:aria-label="t('admin.refresh')"
				@click="users.refetch()"
			/>
		</div>
		<p class="text-sm text-muted">{{ t("users.hint") }}</p>

		<div v-if="users.isPending.value" class="flex justify-center py-16 text-muted" role="status">
			<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
			<span class="sr-only">{{ t("app.loading") }}</span>
		</div>
		<UEmpty v-else-if="users.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="users.error.value?.message" />
		<UEmpty v-else-if="visible.length === 0" icon="lucide:users" :title="t('users.empty')" />
		<div v-else class="overflow-x-auto rounded-xl ring ring-default">
			<table class="w-full text-sm">
				<thead class="bg-elevated/50 text-start text-xs uppercase tracking-wide text-muted">
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
