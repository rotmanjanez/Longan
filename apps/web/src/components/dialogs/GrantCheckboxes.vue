<template>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1" role="group" :aria-label="label">
		<UTooltip v-for="k in GRANT_KEYS" :key="k" :text="t(`sharing.grants.${k}`)">
			<UCheckbox
				:model-value="modelValue[k]"
				:disabled="disabled"
				:aria-label="`${t(`sharing.grants.${k}`)}${label ? ` (${label})` : ''}`"
				:data-grant="k"
				@update:model-value="(v: boolean | 'indeterminate') => emit('update:modelValue', { ...modelValue, [k]: v === true })"
			>
				<template #label>
					<span class="inline-flex items-center gap-1 text-xs text-muted">
						<UIcon :name="GRANT_ICONS[k]" class="size-3.5" />
						<span :class="compact ? 'sr-only' : ''">{{ t(`sharing.grants_short.${k}`) }}</span>
					</span>
				</template>
			</UCheckbox>
		</UTooltip>
	</div>
</template>

<script setup lang="ts">
import type { ShareGrants } from "@longan/shared";
import { useI18n } from "vue-i18n";
import { GRANT_ICONS, GRANT_KEYS } from "./grants.ts";

defineProps<{ modelValue: ShareGrants; disabled?: boolean; compact?: boolean; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: ShareGrants] }>();
const { t } = useI18n();
</script>
