<template>
	<div class="flex items-center" role="group" :aria-label="t('gallery.layout.label')">
		<UTooltip v-for="opt in OPTIONS" :key="opt.value" :text="t(`gallery.layout.${opt.value}`)">
			<UButton
				:icon="opt.icon"
				:color="modelValue === opt.value ? 'primary' : 'neutral'"
				:variant="modelValue === opt.value ? 'soft' : 'ghost'"
				size="sm"
				:aria-label="t(`gallery.layout.${opt.value}`)"
				:aria-pressed="modelValue === opt.value"
				@click="emit('update:modelValue', opt.value)"
			/>
		</UTooltip>
	</div>
</template>

<script setup lang="ts">
import type { PhotoLayout } from "@longan/shared";
import { useI18n } from "vue-i18n";

const OPTIONS: { value: PhotoLayout; icon: string }[] = [
	{ value: "square", icon: "lucide:grid-3x3" },
	{ value: "justified", icon: "lucide:rows-3" },
	{ value: "masonry", icon: "lucide:layout-dashboard" },
	{ value: "grid", icon: "lucide:layout-grid" },
];

defineProps<{ modelValue: PhotoLayout }>();
const emit = defineEmits<{ "update:modelValue": [value: PhotoLayout] }>();
const { t } = useI18n();
</script>
