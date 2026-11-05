<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16 flex flex-col gap-6">
		<PageHeading :title="t('nav.admin_jobs')">
			<USelect v-model="status" size="sm" class="w-36" :items="statusItems" :aria-label="t('jobs.filter')" />
			<UButton
				icon="lucide:refresh-cw"
				size="sm"
				color="neutral"
				variant="ghost"
				:loading="jobs.isFetching.value"
				:aria-label="t('admin.refresh')"
				@click="jobs.refetch()"
			/>
		</PageHeading>

		<section class="rounded-lg ring ring-default p-4 flex flex-col gap-3" aria-labelledby="reprocess-h">
			<h2 id="reprocess-h" class="font-serif text-lg text-highlighted">{{ t("jobs.reprocess.title") }}</h2>
			<p class="text-sm text-muted">{{ t("jobs.reprocess.hint") }}</p>
			<form class="flex flex-col gap-3" @submit.prevent="submitReprocess">
				<div class="grid gap-3 sm:grid-cols-2">
					<UFormField :label="t('jobs.reprocess.scope')">
						<USelect
							v-model="scope"
							class="w-full"
							:items="[
								{ value: 'all', label: t('jobs.reprocess.all') },
								{ value: 'album', label: t('jobs.reprocess.album') },
							]"
						/>
					</UFormField>
					<UFormField :label="t('jobs.reprocess.variants')">
						<USelectMenu
							v-model="variants"
							class="w-full"
							multiple
							value-key="value"
							:search-input="false"
							:placeholder="t('jobs.reprocess.variants_all')"
							:items="REPROCESS_VARIANTS.map((v) => ({ value: v, label: t(`variants.${v}`) }))"
						/>
					</UFormField>
				</div>
				<AlbumPicker
					v-if="scope === 'album'"
					v-model="albumId"
					:allow-root="false"
					:label="t('jobs.reprocess.pick_album')"
				/>
				<div class="flex justify-end">
					<UButton
						type="submit"
						icon="lucide:refresh-ccw-dot"
						:loading="reprocess.isPending.value"
						:disabled="scope === 'album' && !albumId"
					>
						{{ t("jobs.reprocess.submit") }}
					</UButton>
				</div>
			</form>
		</section>

		<LoadingLine v-if="jobs.isPending.value" />
		<UEmpty v-else-if="jobs.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="jobs.error.value?.message" />
		<UEmpty v-else-if="visible.length === 0" icon="lucide:list-checks" :title="t('jobs.empty')" />
		<div v-else class="overflow-x-auto rounded-lg ring ring-default">
			<table class="w-full text-sm">
				<caption class="sr-only">{{ t("nav.admin_jobs") }}</caption>
				<thead class="bg-elevated/50 text-xs text-muted">
					<tr>
						<th scope="col" class="px-3 py-2 text-start font-semibold">#</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("jobs.cols.type") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("jobs.cols.status") }}</th>
						<th scope="col" class="px-3 py-2 text-end font-semibold">{{ t("jobs.cols.attempts") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("jobs.cols.updated") }}</th>
						<th scope="col" class="px-3 py-2 text-start font-semibold">{{ t("jobs.cols.error") }}</th>
						<th scope="col" class="px-3 py-2"><span class="sr-only">{{ t("jobs.cols.actions") }}</span></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-default">
					<tr v-for="j in visible" :key="j.id" :data-job="j.id">
						<td class="px-3 py-2 font-mono text-xs text-dimmed">{{ j.id }}</td>
						<td class="px-3 py-2 font-mono text-xs">{{ j.type }}</td>
						<td class="px-3 py-2">
							<UBadge size="sm" variant="soft" :color="STATUS_COLOR[j.status]">{{ t(`jobs.status.${j.status}`) }}</UBadge>
						</td>
						<td class="px-3 py-2 text-end tabular-nums">{{ j.attempts }}</td>
						<td class="px-3 py-2 text-muted whitespace-nowrap" :title="t('jobs.run_at', { at: fmt(j.runAt) })">{{ fmt(j.updatedAt) }}</td>
						<td class="px-3 py-2 max-w-md">
							<span v-if="j.lastError" class="block text-xs text-error font-mono break-all line-clamp-4">{{ j.lastError }}</span>
						</td>
						<td class="px-3 py-2 text-end">
							<UButton
								v-if="j.status === 'failed'"
								size="xs"
								color="neutral"
								variant="soft"
								icon="lucide:rotate-ccw"
								:loading="retry.isPending.value && retry.variables.value === j.id"
								@click="retry.mutate(j.id)"
							>
								{{ t("jobs.retry") }}
							</UButton>
						</td>
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
import { client } from "@/api/client.ts";
import { orpc, queryClient } from "@/api/query.ts";
import AlbumPicker from "@/components/dialogs/AlbumPicker.vue";
import { useApiAction } from "@/components/dialogs/useDialog.ts";
import LoadingLine from "@/components/layout/LoadingLine.vue";
import PageHeading from "@/components/layout/PageHeading.vue";

type JobStatus = "pending" | "running" | "done" | "failed";
const STATUS_COLOR = { pending: "neutral", running: "info", done: "success", failed: "error" } as const;
const REPROCESS_VARIANTS = ["medium2x", "medium", "small2x", "small", "thumb2x", "thumb"] as const;
type ReprocessVariant = (typeof REPROCESS_VARIANTS)[number];

const { t, locale } = useI18n();

const status = ref<JobStatus | "all">("all");
const statusItems = computed(() => [
	{ value: "all", label: t("jobs.all") },
	...(["pending", "running", "failed", "done"] as const).map((s) => ({
		value: s,
		label: t(`jobs.status.${s}`),
	})),
]);

const jobs = useQuery(
	orpc.admin.jobs.queryOptions({
		input: { limit: 500 },
		// Poll while work is queued so progress is visible without manual refreshes.
		refetchInterval: (q: { state: { data?: readonly { status: string }[] } }) =>
			q.state.data?.some((j) => j.status === "pending" || j.status === "running") ? 3000 : false,
	}),
);
const visible = computed(() =>
	(jobs.data.value ?? []).filter((j) => status.value === "all" || j.status === status.value),
);

const fmt = (iso: string) =>
	new Date(iso).toLocaleString(locale.value, { dateStyle: "short", timeStyle: "medium" });

async function refreshAdmin(): Promise<void> {
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: orpc.admin.jobs.key() }),
		queryClient.invalidateQueries({ queryKey: orpc.admin.health.key() }),
	]);
}

const retry = useApiAction((id: number) => client.admin.retryJob({ id }), {
	success: () => t("jobs.retried"),
	after: refreshAdmin,
});

const scope = ref<"all" | "album">("all");
const albumId = ref<string | null>(null);
const variants = ref<ReprocessVariant[]>([]);

const reprocess = useApiAction(
	(v: { albumId: string | null; variants: ReprocessVariant[] }) =>
		client.admin.reprocess({
			...(v.albumId ? { albumId: v.albumId } : {}),
			...(v.variants.length ? { variants: v.variants } : {}),
		}),
	{
		success: (_v, r) => t("jobs.reprocess.queued", { n: r.queued }, r.queued),
		after: refreshAdmin,
	},
);
function submitReprocess() {
	if (scope.value === "album" && !albumId.value) return;
	reprocess.mutate({
		albumId: scope.value === "album" ? albumId.value : null,
		variants: [...variants.value],
	});
}
</script>
