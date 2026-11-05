<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 flex flex-col gap-8 max-w-2xl">
		<PageHeading :title="t('nav.admin_settings')">
			<UInput v-model="filter" icon="lucide:search" class="max-sm:w-full" :placeholder="t('settings.filter')" :aria-label="t('settings.filter')" />
		</PageHeading>

		<LoadingLine v-if="list.isPending.value" />
		<UEmpty v-else-if="list.isError.value" icon="lucide:triangle-alert" :title="t('errors.load_failed')" :description="list.error.value?.message" />
		<UEmpty v-else-if="filter && !mainSections.length" icon="lucide:search-x" :title="t('settings.no_match')" />
		<template v-else>
			<template v-for="s in shown" :key="s.id">
				<UButton
					v-if="s.id === MORE"
					color="neutral"
					variant="link"
					class="p-0 self-start"
					:trailing-icon="moreOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'"
					:aria-expanded="moreOpen"
					@click="moreOpen = !moreOpen"
				>
					{{ t("settings.more") }}
				</UButton>
				<section v-else :id="`settings-${s.id}`" :aria-labelledby="`settings-${s.id}-h`" class="flex flex-col gap-5">
					<h2 :id="`settings-${s.id}-h`" class="font-serif text-lg text-highlighted">{{ s.label }}</h2>
					<ThemeEditor
						v-if="s.category === THEME_CATEGORY"
						:primary="settingValue('theme.primary') ?? ''"
						:neutral="settingValue('theme.neutral') ?? ''"
						:overrides="settingValue('theme.overrides')"
						@update="setDraft"
					/>
					<!-- Changed rows get a coloured edge until saved. -->
					<div
						v-for="row in s.category === THEME_CATEGORY ? [] : s.rows"
						v-else
						:key="row.key"
						class="ps-3 -ms-3.5 border-s-2"
						:class="isRowDirty(row) ? 'border-warning' : 'border-transparent'"
						:data-setting="row.key"
					>
						<UFormField v-if="pairOf(row)" :label="label(row)">
							<USelect
								class="w-full sm:w-72"
								:items="sortOptions(t, pairOf(row)!.prefix, pairOf(row)!.cols)"
								:model-value="pairValue(pairOf(row)!)"
								@update:model-value="(v: string) => setPair(pairOf(row)!, v)"
							/>
						</UFormField>
						<USwitch
							v-else-if="typeOf(row).kind === 'bool'"
							:id="inputId(row.key)"
							:label="label(row)"
							:description="hint(row)"
							:model-value="settingBool(settingValue(row.key))"
							@update:model-value="(v: boolean) => setDraft(row.key, v ? '1' : '0')"
						/>
						<UFormField
							v-else
							:label="label(row)"
							:description="hint(row)"
							:for="inputId(row.key)"
							:error="errorText(row.key)"
						>
							<SettingInput
								:id="inputId(row.key)"
								:type="typeOf(row)"
								:label="label(row)"
								:model-value="settingValue(row.key)"
								:invalid="!!errorOf(row.key)"
								:options="enumOptions(row)"
								@update:model-value="(v: string) => setDraft(row.key, v)"
							/>
						</UFormField>
					</div>
				</section>
			</template>
		</template>

		<!-- The one place that saves settings (theme included). -->
		<div class="sticky bottom-0 z-20 -mx-3 sm:mx-0 pb-[env(safe-area-inset-bottom)] sm:pb-4">
			<div
				v-if="dirtyKeys.length"
				class="flex items-center gap-2 px-4 py-3 sm:rounded-xl bg-default/90 backdrop-blur shadow-lg ring ring-default"
				role="region"
				:aria-label="t('settings.unsaved')"
			>
				<span class="flex-1 min-w-0 text-sm text-warning">{{ t("settings.unsaved_n", dirtyKeys.length) }}</span>
				<UButton color="neutral" variant="ghost" :disabled="save.isPending.value" @click="discardAll">
					{{ t("settings.discard") }}
				</UButton>
				<UButton icon="lucide:check" :loading="save.isPending.value" :disabled="hasErrors" @click="saveAll">
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
import LoadingLine from "@/components/layout/LoadingLine.vue";
import PageHeading from "@/components/layout/PageHeading.vue";
import {
	ADVANCED_CATEGORIES,
	ADVANCED_KEYS,
	categoryId,
	categoryLabel,
	HIDDEN_KEYS,
	optionLabel,
	SORT_ORDER_KEYS,
	SORT_PAIRS,
	settingHint,
	settingLabel,
} from "@/lib/settingsMeta.ts";
import {
	checkSettingValue,
	groupSettings,
	parseSettingType,
	type SettingType,
	settingBool,
} from "@/lib/settingType.ts";
import { parseSortValue, sortOptions, sortValue } from "@/lib/sorting.ts";
import { invalidOverrideTokens, parseOverrides } from "@/lib/theme.ts";

const THEME_CATEGORY = "Theme";

const { t, te } = useI18n();
const list = useQuery(orpc.settings.list.queryOptions());
const filter = ref("");
const moreOpen = ref(false);

type Section = { id: string; category: string; label: string; rows: SettingRow[] };

const byKey = computed(() => new Map((list.data.value ?? []).map((r) => [r.key, r])));
const label = (r: SettingRow) => settingLabel(t, te, r);
const hint = (r: SettingRow) => settingHint(t, te, r.key);

/** Categories in server order, minus hidden rows and the "order" half of each sort pair. */
const sections = computed(() =>
	groupSettings(
		(list.data.value ?? []).filter((r) => !HIDDEN_KEYS.has(r.key) && !SORT_ORDER_KEYS.has(r.key)),
	),
);
function build(advanced: boolean): Section[] {
	const q = filter.value.trim().toLowerCase();
	return sections.value
		.map((g) => {
			const cat = categoryLabel(t, te, g.category);
			const rows = g.rows.filter((r) => {
				// While filtering everything is searched; otherwise rows split into main and "More settings".
				if (!q) return (ADVANCED_CATEGORIES.has(g.category) || ADVANCED_KEYS.has(r.key)) === advanced;
				return [r.key, label(r), hint(r) ?? "", cat].some((s) => s.toLowerCase().includes(q));
			});
			return { id: categoryId(g.category), category: g.category, label: cat, rows };
		})
		.filter((s) => s.rows.length);
}
const MORE = "__more";
const mainSections = computed(() => build(false));
/** Main categories, then the "More settings" toggle and (when open) the advanced ones. Filtering shows all matches. */
const shown = computed<Section[]>(() => {
	if (filter.value.trim()) return mainSections.value;
	const advanced = build(true);
	if (!advanced.length) return mainSections.value;
	return [
		...mainSections.value,
		{ id: MORE, category: "", label: "", rows: [] },
		...(moreOpen.value ? advanced : []),
	];
});

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
const settingValue = (key: string) =>
	key in drafts ? (drafts[key] ?? null) : (byKey.value.get(key)?.value ?? null);
const isDirtyKey = (key: string) => key in drafts && drafts[key] !== byKey.value.get(key)?.value;
function errorOf(key: string) {
	const row = byKey.value.get(key);
	if (!row || !isDirtyKey(key)) return null;
	if (key === "theme.overrides" && invalidOverrideTokens(parseOverrides(settingValue(key))).size)
		return { key: "settings.errors.color" };
	return checkSettingValue(typeOf(row), settingValue(key));
}
const dirtyKeys = computed(() => Object.keys(drafts).filter(isDirtyKey));
const hasErrors = computed(() => dirtyKeys.value.some((k) => errorOf(k) !== null));

function setDraft(key: string, v: string) {
	if (v === byKey.value.get(key)?.value) delete drafts[key];
	else drafts[key] = v;
}
function discardAll() {
	for (const k of Object.keys(drafts)) delete drafts[k];
}

const save = useSaveSettings(
	() => t("settings.saved"),
	(entries) => {
		for (const e of entries) if (drafts[e.key] === e.value) delete drafts[e.key];
	},
);
function saveAll() {
	const entries = dirtyKeys.value.map((key) => ({ key, value: settingValue(key) }));
	if (entries.length && !hasErrors.value) save.mutate(entries);
}

const inputId = (key: string) => `setting-${key.replace(/[^a-z0-9]+/gi, "-")}`;

type Pair = (typeof SORT_PAIRS)[number];
const pairOf = (row: SettingRow): Pair | undefined => SORT_PAIRS.find((p) => p.col === row.key);
const pairValue = (p: Pair) =>
	sortValue(settingValue(p.col) ?? "", settingValue(p.order) === "asc" ? "asc" : "desc");
function setPair(p: Pair, v: string) {
	const s = parseSortValue(v);
	setDraft(p.col, s.col);
	setDraft(p.order, s.order);
}
const isRowDirty = (row: SettingRow) => {
	const p = pairOf(row);
	return p ? isDirtyKey(p.col) || isDirtyKey(p.order) : isDirtyKey(row.key);
};
function errorText(key: string) {
	const e = errorOf(key);
	return e ? t(e.key, e.params ?? {}) : undefined;
}
function enumOptions(row: SettingRow) {
	const ty = typeOf(row);
	return ty.kind === "enum"
		? ty.options.map((o) => ({ value: o, label: optionLabel(t, te, row.key, o) }))
		: undefined;
}
</script>
