<template>
	<div class="flex items-center gap-1">
		<div class="flex" role="group" :aria-label="t('lightbox.details.rating')">
			<button
				v-for="n in 5"
				:key="n"
				type="button"
				class="p-0.5 rounded-sm disabled:cursor-default focus-visible:outline-2 focus-visible:outline-primary"
				:class="readonly ? '' : 'hover:scale-110 transition-transform'"
				:disabled="readonly"
				:aria-label="t('lightbox.details.rate', { n }, n)"
				:aria-pressed="!readonly ? mine === n : undefined"
				@click="emit('rate', mine === n ? 0 : n)"
				@mouseenter="hover = n"
				@mouseleave="hover = 0"
			>
				<UIcon
					name="lucide:star"
					class="size-5"
					:class="n <= shown ? 'text-warning [&>path]:fill-current' : 'text-dimmed'"
				/>
			</button>
		</div>
		<span v-if="avg !== null && avg !== undefined" class="text-xs text-muted">
			{{ t("lightbox.details.rating_avg", { avg: avg.toFixed(1) }) }}
		</span>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{ mine: number | null; avg?: number | null; readonly?: boolean }>();
const emit = defineEmits<{ rate: [rating: number] }>();
const { t } = useI18n();
const hover = ref(0);
const shown = computed(() => (!props.readonly && hover.value) || props.mine || Math.round(props.avg ?? 0));
</script>
