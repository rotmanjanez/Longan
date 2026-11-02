<template>
	<div class="flex flex-wrap items-center justify-end gap-2 w-full">
		<slot name="start" />
		<span class="flex-1" />
		<UButton color="neutral" variant="ghost" :disabled="loading" @click="emit('cancel')">
			{{ cancelLabel ?? t("common.cancel") }}
		</UButton>
		<UButton
			type="submit"
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

/** Cancel + confirm footer shared by all dialogs; confirm submits the form with id `form`. */
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
