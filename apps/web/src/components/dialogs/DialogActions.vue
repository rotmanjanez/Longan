<template>
	<div class="flex items-center justify-end gap-2 w-full">
		<UButton color="neutral" variant="ghost" class="max-sm:flex-1" :disabled="loading" @click="emit('cancel')">
			{{ cancelLabel ?? t("common.cancel") }}
		</UButton>
		<UButton
			type="submit"
			class="max-sm:flex-1"
			:form="form"
			:color="danger ? 'error' : 'primary'"
			:icon="icon"
			:loading="loading"
			:disabled="disabled"
		>
			{{ confirmLabel }}
		</UButton>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

/**
 * Cancel + confirm footer shared by every action dialog (which therefore has no header close button);
 * confirm submits the form with id `form`. On phones both buttons split the row evenly.
 */
defineProps<{
	form: string;
	confirmLabel: string;
	cancelLabel?: string;
	loading?: boolean;
	disabled?: boolean;
	danger?: boolean;
	icon?: string;
}>();
const emit = defineEmits<{ cancel: [] }>();
const { t } = useI18n();
</script>
