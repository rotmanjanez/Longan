<template>
	<div class="px-3 sm:px-6 lg:px-8 pt-6 flex flex-col gap-6 max-w-5xl">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-lg font-bold text-highlighted flex-1">{{ t("nav.admin_settings") }}</h1>
			<UInput v-model="filter" icon="lucide:search" class="max-sm:w-full" :placeholder="t('settings.filter')" :aria-label="t('settings.filter')" />
		</div>

		<div v-if="list.isPending.value" class="flex justify-center py-16 text-muted" role="status">
			<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
			<span class="sr-only">{{ t("app.loading") }}</span>
		</div>
		<UEmpty v-else-if="list.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="list.error.value?.message" />
		<template v-else>
			<nav class="flex flex-wrap gap-1 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:-mx-3 max-sm:px-3 max-sm:pb-1 [scrollbar-width:none]" :aria-label="t('settings.categories')">
				<UButton
					v-for="g in groups"
					:key="g.category"
					size="sm"
					color="neutral"
					variant="soft"
					class="shrink-0"
					:to="{ hash: `#${anchor(g.category)}` }"
				>
					{{ g.category }}
				</UButton>
			</nav>

			<section
				v-for="g in visibleGroups"
				:id="anchor(g.category)"
				:key="g.category"
				class="rounded-xl ring ring-default bg-default scroll-mt-20"
				:aria-labelledby="`${anchor(g.category)}-h`"
			>
				<header class="px-4 py-3 border-b border-default">
					<h2 :id="`${anchor(g.category)}-h`" class="font-semibold text-highlighted">{{ g.category }}</h2>
				</header>

				<div v-if="g.category === THEME_CATEGORY && !filter" class="p-4">
					<ThemeEditor :rows="g.rows" />
				</div>
				<ul v-else class="divide-y divide-default">
					<li
						v-for="row in g.rows"
						:key="row.key"
						class="grid gap-x-4 gap-y-2 px-4 py-3 border-s-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center"
						:class="isDirty(row) ? 'border-warning' : 'border-transparent'"
						:data-setting="row.key"
					>
						<label :for="inputId(row.key)" class="min-w-0">
							<span class="block text-sm text-default">{{ row.description }}</span>
							<code class="block text-xs text-dimmed break-all">{{ row.key }}</code>
						</label>
						<div class="min-w-0 flex flex-col gap-1">
							<SettingInput
								:id="inputId(row.key)"
								:type="typeOf(row)"
								:model-value="current(row)"
								:label="row.description"
								:invalid="!!errorOf(row)"
								@update:model-value="(v: string) => setDraft(row, v)"
							/>
							<p v-if="errorOf(row)" class="text-xs text-error" role="alert">
								{{ t(errorOf(row)!.key, errorOf(row)!.params ?? {}) }}
							</p>
						</div>
					</li>
				</ul>
			</section>
			<UEmpty v-if="visibleGroups.length === 0" icon="lucide:search-x" :title="t('settings.no_match')" />
		</template>

		<!-- The one place that saves setting rows (the theme editor keeps its own draft and save button). -->
		<div class="sticky bottom-0 z-20 -mx-3 sm:mx-0 pb-[env(safe-area-inset-bottom)] sm:pb-4">
			<div
				v-if="dirtyRows.length"
				class="flex items-center gap-2 px-4 py-3 sm:rounded-xl bg-default/90 backdrop-blur ring ring-default shadow-lg"
				role="region"
				:aria-label="t('settings.unsaved')"
			>
				<span class="flex-1 min-w-0 text-sm text-warning">{{ t("settings.unsaved_n", dirtyRows.length) }}</span>
				<UButton color="neutral" variant="ghost" :disabled="save.isPending.value" @click="discardRows(dirtyRows)">
					{{ t("settings.discard") }}
				</UButton>
				<UButton icon="lucide:save" :loading="save.isPending.value" :disabled="hasErrors(dirtyRows)" @click="saveRows(dirtyRows)">
					{{ t("common.save") }}
				</UButton>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { SettingRow } from "@longan/shared";
import { useQuery } from "@tanstack/vue-query";
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/api/query.ts";
import SettingInput from "@/components/admin/SettingInput.vue";
import ThemeEditor from "@/components/admin/ThemeEditor.vue";
import { useSaveSettings } from "@/components/admin/useSaveSettings.ts";
import { checkSettingValue, groupSettings, parseSettingType, type SettingType } from "@/lib/settingType.ts";

const THEME_CATEGORY = "Theme";

const { t } = useI18n();
const list = useQuery(orpc.settings.list.queryOptions());
const filter = ref("");

const groups = computed(() => groupSettings(list.data.value ?? []));
const visibleGroups = computed(() => {
	const q = filter.value.trim().toLowerCase();
	if (!q) return groups.value;
	return groups.value
		.map((g) => ({
			category: g.category,
			rows: g.rows.filter(
				(r) =>
					r.key.toLowerCase().includes(q) ||
					r.description.toLowerCase().includes(q) ||
					g.category.toLowerCase().includes(q),
			),
		}))
		.filter((g) => g.rows.length);
});

const anchor = (category: string) => `settings-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
const inputId = (key: string) => `setting-${key.replace(/[^a-z0-9]+/gi, "-")}`;

const typeCache = new Map<string, SettingType>();
function typeOf(row: SettingRow): SettingType {
	let ty = typeCache.get(row.type);
	if (!ty) {
		ty = parseSettingType(row.type);
		typeCache.set(row.type, ty);
	}
	return ty;
}

/** Unsaved edits by key. */
const drafts = reactive<Record<string, string | null>>({});
const current = (row: SettingRow) => (row.key in drafts ? (drafts[row.key] ?? null) : row.value);
const isDirty = (row: SettingRow) => row.key in drafts && drafts[row.key] !== row.value;
const errorOf = (row: SettingRow) => (isDirty(row) ? checkSettingValue(typeOf(row), current(row)) : null);
const hasErrors = (rows: SettingRow[]) => rows.some((r) => errorOf(r) !== null);
const dirtyRows = computed(() => (list.data.value ?? []).filter(isDirty));

function setDraft(row: SettingRow, v: string) {
	if (v === row.value) delete drafts[row.key];
	else drafts[row.key] = v;
}
function discardRows(rows: SettingRow[]) {
	for (const r of rows) delete drafts[r.key];
}

const save = useSaveSettings(
	() => t("settings.saved"),
	(entries) => {
		for (const e of entries) if (drafts[e.key] === e.value) delete drafts[e.key];
	},
);
function saveRows(rows: SettingRow[]) {
	const entries = rows
		.filter((r) => isDirty(r) && !errorOf(r))
		.map((r) => ({ key: r.key, value: current(r) }));
	if (!entries.length) return;
	save.mutate(entries);
}
</script>
