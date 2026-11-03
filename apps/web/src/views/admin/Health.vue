<template>
	<div class="px-3 sm:px-6 lg:px-8 py-6 flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-lg font-bold text-highlighted flex-1">{{ t("nav.admin_health") }}</h1>
			<UButton
				icon="lucide:refresh-cw"
				size="sm"
				color="neutral"
				variant="ghost"
				:loading="health.isFetching.value"
				@click="health.refetch()"
			>
				{{ t("admin.refresh") }}
			</UButton>
		</div>

		<div v-if="health.isPending.value" class="flex justify-center py-16 text-muted" role="status">
			<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
			<span class="sr-only">{{ t("app.loading") }}</span>
		</div>
		<UEmpty v-else-if="health.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="health.error.value?.message" />
		<div v-else-if="h" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			<div v-for="card in cards" :key="card.key" class="rounded-xl ring ring-default p-4 flex flex-col gap-2" :data-health="card.key">
				<div class="flex items-center gap-2">
					<UIcon :name="card.icon" class="size-5 text-muted" />
					<h2 class="font-semibold text-highlighted flex-1">{{ t(`health.${card.key}`) }}</h2>
					<UBadge v-if="card.ok !== undefined" size="sm" :color="card.ok ? 'success' : 'error'" variant="soft">
						{{ card.ok ? t("health.ok") : t("health.problem") }}
					</UBadge>
				</div>
				<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
					<template v-for="[label, val] in card.rows" :key="label">
						<dt class="text-muted">{{ label }}</dt>
						<dd class="text-default break-all font-mono text-xs self-center">{{ val }}</dd>
					</template>
				</dl>
				<UProgress v-if="card.key === 'storage' && usedRatio !== null" :model-value="usedRatio" size="xs" />
				<UButton v-if="card.key === 'jobs'" size="xs" variant="link" class="self-start px-0" :to="{ name: 'admin-jobs' }">
					{{ t("health.open_jobs") }}
				</UButton>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/api/query.ts";
import { formatBytes } from "@/lib/format.ts";

const { t, n } = useI18n();
const health = useQuery(orpc.admin.health.queryOptions({ refetchInterval: 30_000 }));
const h = computed(() => health.data.value);

const usedRatio = computed(() => {
	const s = h.value?.storage;
	if (!s) return null;
	const total = s.freeBytes + s.usedBytes;
	return total > 0 ? Math.round((s.usedBytes / total) * 100) : null;
});

type Card = { key: string; icon: string; ok?: boolean; rows: [string, string | number][] };
const cards = computed<Card[]>(() => {
	const x = h.value;
	if (!x) return [];
	return [
		{
			key: "server",
			icon: "lucide:server",
			rows: [
				[t("health.version"), x.version],
				[t("health.runtime"), `${x.runtime.name} ${x.runtime.version}`],
			],
		},
		{
			key: "database",
			icon: "lucide:database",
			ok: x.db.ok,
			rows: [[t("health.version"), x.db.version ?? "—"]],
		},
		{
			key: "storage",
			icon: "lucide:hard-drive",
			ok: x.storage.freeBytes > 0,
			rows: [
				[t("health.path"), x.storage.path],
				[t("health.used"), formatBytes(x.storage.usedBytes)],
				[t("health.free"), formatBytes(x.storage.freeBytes)],
			],
		},
		{
			key: "media",
			icon: "lucide:image",
			ok: x.ffmpeg.available,
			rows: [
				["libvips", x.vips.version],
				["HEIF", x.vips.heif ? t("health.yes") : t("health.no")],
				["ffmpeg", x.ffmpeg.available ? (x.ffmpeg.version ?? t("health.yes")) : t("health.missing")],
			],
		},
		{
			key: "jobs",
			icon: "lucide:list-checks",
			ok: x.jobs.failed === 0,
			rows: [
				[t("jobs.status.pending"), n(x.jobs.pending)],
				[t("jobs.status.failed"), n(x.jobs.failed)],
			],
		},
		{
			key: "counts",
			icon: "lucide:chart-column",
			rows: [
				[t("health.users"), n(x.counts.users)],
				[t("health.albums"), n(x.counts.albums)],
				[t("health.photos"), n(x.counts.photos)],
			],
		},
	];
});
</script>
