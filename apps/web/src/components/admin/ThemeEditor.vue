<template>
	<div class="flex flex-col gap-5" data-theme-editor>
		<fieldset class="flex flex-col gap-2">
			<legend class="text-sm font-medium text-highlighted mb-2">{{ t("settings.theme.primary") }}</legend>
			<div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('settings.theme.primary')">
				<button
					v-for="c in THEME_COLORS"
					:key="c"
					type="button"
					role="radio"
					:aria-checked="draft.primary === c"
					:title="c"
					:aria-label="c"
					class="size-8 rounded-full ring-offset-2 ring-offset-(--ui-bg) transition focus-visible:outline-2 focus-visible:outline-primary"
					:class="draft.primary === c ? 'ring-2 ring-(--ui-text-highlighted)' : 'hover:scale-110'"
					:style="{ background: paletteFor(c)?.['500'] }"
					@click="draft.primary = c"
				/>
			</div>
		</fieldset>

		<fieldset class="flex flex-col gap-2">
			<legend class="text-sm font-medium text-highlighted mb-2">{{ t("settings.theme.neutral") }}</legend>
			<div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('settings.theme.neutral')">
				<button
					v-for="c in THEME_NEUTRALS"
					:key="c"
					type="button"
					role="radio"
					:aria-checked="draft.neutral === c"
					class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ring transition"
					:class="draft.neutral === c ? 'ring-2 ring-primary text-highlighted' : 'ring-default text-muted hover:text-default'"
					@click="draft.neutral = c"
				>
					<span class="flex overflow-hidden rounded">
						<span v-for="s in ['200', '500', '800']" :key="s" class="size-3.5" :style="{ background: paletteFor(c)?.[s as Shade] }" />
					</span>
					{{ c }}
				</button>
			</div>
		</fieldset>

		<details class="group rounded-lg ring ring-default" :open="overrideCount > 0">
			<summary class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-highlighted select-none">
				<UIcon name="lucide:chevron-right" class="size-4 transition group-open:rotate-90" />
				{{ t("settings.theme.overrides") }}
				<UBadge v-if="overrideCount" size="sm" color="primary" variant="soft">{{ overrideCount }}</UBadge>
			</summary>
			<div class="flex flex-col gap-4 px-3 pb-3">
				<p class="text-xs text-muted">{{ t("settings.theme.overrides_hint") }}</p>
				<div v-for="role in ROLES" :key="role" class="flex flex-col gap-1.5">
					<h4 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ t(`settings.theme.${role}`) }}</h4>
					<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1.5">
						<div v-for="shade in shades" :key="shade" class="flex items-center gap-2">
							<span class="w-8 text-xs tabular-nums text-dimmed">{{ shade }}</span>
							<label class="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring ring-default">
								<span class="absolute inset-0" :style="{ background: effective(role, shade) }" />
								<input
									type="color"
									class="absolute inset-0 opacity-0 cursor-pointer"
									:value="toHex(effective(role, shade))"
									:aria-label="t('settings.theme.pick', { token: `${role}-${shade}` })"
									@input="setOverride(role, shade, ($event.target as HTMLInputElement).value)"
								/>
							</label>
							<UInput
								size="xs"
								class="w-28 font-mono"
								placeholder="#rrggbb"
								:model-value="draft.overrides[`${role}-${shade}`] ?? ''"
								:color="invalidTokens.has(`${role}-${shade}`) ? 'error' : undefined"
								:aria-invalid="invalidTokens.has(`${role}-${shade}`) || undefined"
								:aria-label="t('settings.theme.override', { token: `${role}-${shade}` })"
								@update:model-value="(v: string | number) => setOverride(role, shade, String(v))"
							/>
							<UButton
								v-if="draft.overrides[`${role}-${shade}`]"
								size="xs"
								color="neutral"
								variant="ghost"
								icon="lucide:x"
								:aria-label="t('settings.theme.clear_override', { token: `${role}-${shade}` })"
								@click="setOverride(role, shade, '')"
							/>
						</div>
					</div>
				</div>
			</div>
		</details>

		<div class="flex flex-col gap-2 rounded-lg bg-elevated/50 p-3 ring ring-default" :aria-label="t('settings.theme.preview')">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted">{{ t("settings.theme.preview") }}</span>
			<div class="flex flex-wrap items-center gap-2">
				<UButton icon="lucide:upload">{{ t("gallery.actions.upload") }}</UButton>
				<UButton variant="soft" icon="lucide:share-2">{{ t("gallery.actions.share") }}</UButton>
				<UButton color="neutral" variant="outline">{{ t("common.cancel") }}</UButton>
				<UBadge>{{ draft.primary }}</UBadge>
				<UBadge color="neutral" variant="soft">{{ draft.neutral }}</UBadge>
				<span class="text-primary text-sm font-medium">{{ t("settings.theme.link_sample") }}</span>
			</div>
			<div v-for="role in ROLES" :key="role" class="flex overflow-hidden rounded-md">
				<span
					v-for="shade in shades"
					:key="shade"
					class="h-5 flex-1"
					:style="{ background: `var(--ui-color-${role}-${shade})` }"
					:title="`${role}-${shade}`"
				/>
			</div>
		</div>

		<div class="flex flex-wrap items-center justify-end gap-2">
			<span v-if="dirty" class="text-xs text-warning me-auto">{{ t("settings.unsaved") }}</span>
			<UButton color="neutral" variant="ghost" :disabled="!dirty || save.isPending.value" @click="discard">
				{{ t("settings.discard") }}
			</UButton>
			<UButton icon="lucide:save" :disabled="!dirty || invalidTokens.size > 0" :loading="save.isPending.value" @click="submit">
				{{ t("settings.theme.save") }}
			</UButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { SettingRow, ThemePalette } from "@longan/shared";
import { computed, onBeforeUnmount, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useInit } from "@/composables/useInit.ts";
import { THEME_COLORS, THEME_NEUTRALS } from "@/lib/options.ts";
import { applyTheme, paletteFor, SHADES } from "@/lib/theme.ts";
import { useSaveSettings } from "./useSaveSettings.ts";

const shades = SHADES;
type Shade = (typeof SHADES)[number];
type Role = "primary" | "neutral";
const ROLES: Role[] = ["primary", "neutral"];
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The "Theme" settings category: palette pickers, per-shade overrides and a live preview of the draft. */
const props = defineProps<{ rows: SettingRow[] }>();
const { t } = useI18n();
const { config } = useInit();

function value(key: string): string | null {
	return props.rows.find((r) => r.key === key)?.value ?? null;
}

function parseOverrides(raw: string | null): Record<string, string> {
	try {
		const v = JSON.parse(raw ?? "{}");
		if (!v || typeof v !== "object" || Array.isArray(v)) return {};
		return Object.fromEntries(
			Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"),
		);
	} catch {
		return {};
	}
}

const saved = computed<ThemePalette>(() => ({
	primary: (value("theme.primary") ?? config.value.theme.primary) as ThemePalette["primary"],
	neutral: (value("theme.neutral") ?? config.value.theme.neutral) as ThemePalette["neutral"],
	overrides: parseOverrides(value("theme.overrides")),
}));

const draft = reactive<{ primary: string; neutral: string; overrides: Record<string, string> }>({
	primary: "",
	neutral: "",
	overrides: {},
});

function discard() {
	draft.primary = saved.value.primary;
	draft.neutral = saved.value.neutral;
	draft.overrides = { ...saved.value.overrides };
}
discard();

const cleanOverrides = computed(() =>
	Object.fromEntries(
		Object.entries(draft.overrides)
			.filter(([, v]) => v.trim() !== "")
			.map(([k, v]) => [k, v.trim()]),
	),
);
const invalidTokens = computed(
	() =>
		new Set(
			Object.entries(cleanOverrides.value)
				.filter(([, v]) => !HEX_RE.test(v))
				.map(([k]) => k),
		),
);
const overrideCount = computed(() => Object.keys(cleanOverrides.value).length);
const overridesJson = computed(() => JSON.stringify(cleanOverrides.value));
const dirty = computed(
	() =>
		draft.primary !== saved.value.primary ||
		draft.neutral !== saved.value.neutral ||
		overridesJson.value !== JSON.stringify(saved.value.overrides),
);

// Re-sync when the saved values change underneath us (after a save / refetch), unless the user is editing.
watch(saved, () => {
	if (!dirty.value) discard();
});

function effective(role: Role, shade: Shade): string {
	const o = draft.overrides[`${role}-${shade}`];
	if (o && HEX_RE.test(o.trim())) return o.trim();
	return paletteFor(draft[role])?.[shade] ?? "transparent";
}

function setOverride(role: Role, shade: Shade, v: string) {
	const key = `${role}-${shade}`;
	if (v.trim() === "") {
		const { [key]: _, ...rest } = draft.overrides;
		draft.overrides = rest;
	} else draft.overrides = { ...draft.overrides, [key]: v };
}

/** Any CSS colour (the palettes are oklch) -> #rrggbb for the native colour input. */
const hexCache = new Map<string, string>();
let ctx2d: CanvasRenderingContext2D | null | undefined;
function toHex(css: string): string {
	if (/^#[0-9a-f]{6}$/i.test(css)) return css.toLowerCase();
	const hit = hexCache.get(css);
	if (hit) return hit;
	if (ctx2d === undefined) {
		try {
			ctx2d = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
		} catch {
			ctx2d = null;
		}
	}
	let out = "#808080";
	if (ctx2d) {
		ctx2d.fillStyle = "#808080";
		ctx2d.fillStyle = css;
		ctx2d.fillRect(0, 0, 1, 1);
		const [r = 0, g = 0, b = 0] = ctx2d.getImageData(0, 0, 1, 1).data;
		out = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
	}
	hexCache.set(css, out);
	return out;
}

// Live preview: the draft is applied to :root while editing; leaving the page restores the saved theme.
const previewTheme = computed<ThemePalette>(() => ({
	primary: draft.primary as ThemePalette["primary"],
	neutral: draft.neutral as ThemePalette["neutral"],
	overrides: Object.fromEntries(
		Object.entries(cleanOverrides.value).filter(([k]) => !invalidTokens.value.has(k)),
	),
}));
watch(previewTheme, (th) => applyTheme(th), { immediate: true });
onBeforeUnmount(() => applyTheme(config.value.theme));

const save = useSaveSettings(() => t("settings.theme.saved"));
function submit() {
	if (!dirty.value || invalidTokens.value.size) return;
	save.mutate([
		{ key: "theme.primary", value: draft.primary },
		{ key: "theme.neutral", value: draft.neutral },
		{ key: "theme.overrides", value: overridesJson.value },
	]);
}
</script>
