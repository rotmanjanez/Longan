<template>
	<div class="flex flex-col gap-5" data-theme-editor>
		<fieldset class="flex flex-col gap-2">
			<legend class="text-sm font-medium mb-2">{{ t("settings.theme.primary") }}</legend>
			<div class="flex flex-wrap gap-2.5" role="radiogroup" :aria-label="t('settings.theme.primary')">
				<button
					v-for="c in THEME_COLORS"
					:key="c"
					type="button"
					role="radio"
					:aria-checked="primary === c"
					:aria-label="c"
					class="size-8 rounded-full ring-offset-2 ring-offset-(--ui-bg) transition focus-visible:outline-2 focus-visible:outline-primary"
					:class="primary === c ? 'ring-2 ring-(--ui-text-highlighted)' : ''"
					:style="{ background: paletteFor(c)?.['500'] }"
					@click="emit('update', 'theme.primary', c)"
				/>
			</div>
		</fieldset>

		<fieldset class="flex flex-col gap-2">
			<legend class="text-sm font-medium mb-2">{{ t("settings.theme.neutral") }}</legend>
			<div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('settings.theme.neutral')">
				<button
					v-for="c in THEME_NEUTRALS"
					:key="c"
					type="button"
					role="radio"
					:aria-checked="neutral === c"
					class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition"
					:class="neutral === c ? 'bg-inverted text-inverted' : 'bg-elevated text-muted'"
					@click="emit('update', 'theme.neutral', c)"
				>
					<span class="flex overflow-hidden rounded-full">
						<span v-for="sh in ['200', '500', '800']" :key="sh" class="size-3" :style="{ background: paletteFor(c)?.[sh as Shade] }" />
					</span>
					{{ c }}
				</button>
			</div>
		</fieldset>

		<UCollapsible :default-open="overrideCount > 0" :unmount-on-hide="false">
			<template #default="{ open }">
				<UButton color="neutral" variant="link" class="p-0" :trailing-icon="open ? 'lucide:chevron-up' : 'lucide:chevron-down'">
					{{ t("settings.theme.overrides") }}
					<template v-if="overrideCount"> ({{ overrideCount }})</template>
				</UButton>
			</template>
			<template #content>
				<div class="flex flex-col gap-4 pt-3">
					<p class="text-sm text-muted">{{ t("settings.theme.overrides_hint") }}</p>
					<div v-for="role in ROLES" :key="role" class="flex flex-col gap-1.5">
						<h4 class="text-sm font-medium">{{ t(`settings.theme.${role}`) }}</h4>
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
							<div v-for="shade in SHADES" :key="shade" class="flex items-center gap-2">
								<label class="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md">
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
									size="sm"
									class="min-w-0 flex-1 font-mono"
									:placeholder="String(shade)"
									:model-value="parsed[`${role}-${shade}`] ?? ''"
									:color="invalid.has(`${role}-${shade}`) ? 'error' : undefined"
									:aria-invalid="invalid.has(`${role}-${shade}`) || undefined"
									:aria-label="t('settings.theme.override', { token: `${role}-${shade}` })"
									@update:model-value="(v: string | number) => setOverride(role, shade, String(v))"
								/>
							</div>
						</div>
					</div>
				</div>
			</template>
		</UCollapsible>
	</div>
</template>

<script setup lang="ts">
import type { ThemePalette } from "@longan/shared";
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useInit } from "@/composables/useInit.ts";
import { THEME_COLORS, THEME_NEUTRALS } from "@/lib/options.ts";
import { applyTheme, invalidOverrideTokens, paletteFor, parseOverrides, SHADES } from "@/lib/theme.ts";

type Shade = (typeof SHADES)[number];
type Role = "primary" | "neutral";
const ROLES: Role[] = ["primary", "neutral"];

/**
 * The theme rows of the settings page (colour pickers + optional per-shade overrides). Controlled: values come
 * from the page's drafts and changes go back through `update`, so the page's one save bar saves them. The
 * draft is applied to the whole app while editing; leaving the page restores the saved theme.
 */
const props = defineProps<{ primary: string; neutral: string; overrides: string | null }>();
const emit = defineEmits<{ update: [key: string, value: string] }>();
const { t } = useI18n();
const { config } = useInit();

const parsed = computed(() => parseOverrides(props.overrides));
const invalid = computed(() => invalidOverrideTokens(parsed.value));
const overrideCount = computed(() => Object.values(parsed.value).filter((v) => v.trim() !== "").length);

function effective(role: Role, shade: Shade): string {
	const o = parsed.value[`${role}-${shade}`]?.trim();
	if (o && !invalid.value.has(`${role}-${shade}`)) return o;
	return paletteFor(props[role])?.[shade] ?? "transparent";
}

function setOverride(role: Role, shade: Shade, v: string) {
	const key = `${role}-${shade}`;
	const { [key]: _, ...rest } = parsed.value;
	emit("update", "theme.overrides", JSON.stringify(v.trim() === "" ? rest : { ...rest, [key]: v.trim() }));
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

watch(
	() => [props.primary, props.neutral, parsed.value, invalid.value] as const,
	([primary, neutral, overrides, bad]) =>
		applyTheme({
			primary: primary as ThemePalette["primary"],
			neutral: neutral as ThemePalette["neutral"],
			overrides: Object.fromEntries(Object.entries(overrides).filter(([k, v]) => v.trim() && !bad.has(k))),
		}),
	{ immediate: true },
);
onBeforeUnmount(() => applyTheme(config.value.theme));
</script>
