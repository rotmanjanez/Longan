<template>
	<div class="min-h-dvh flex flex-col items-center justify-center gap-6 p-6 text-center" role="status" aria-live="polite">
		<div class="flex items-center gap-3 text-highlighted">
			<UIcon name="lucide:images" class="size-8 text-primary" />
			<span class="text-2xl font-bold">{{ t("app.name") }}</span>
		</div>
		<template v-if="error">
			<UAlert
				class="max-w-md text-start"
				color="error"
				variant="subtle"
				icon="lucide:triangle-alert"
				:title="t('app.init_failed')"
				:description="message"
			/>
			<UButton icon="lucide:refresh-cw" color="neutral" variant="outline" :loading="loading" @click="emit('retry')">
				{{ t("app.retry") }}
			</UButton>
		</template>
		<div v-else class="flex items-center gap-2 text-muted">
			<UIcon name="lucide:loader-circle" class="size-5 animate-spin" />
			<span>{{ t("app.loading") }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { errorCode } from "@/api/errors.ts";

const props = defineProps<{ error: unknown; loading?: boolean }>();
const emit = defineEmits<{ retry: [] }>();
const { t } = useI18n();

const message = computed(() => {
	const e = props.error;
	const code = errorCode(e);
	const text = e instanceof Error ? e.message : String(e ?? "");
	return code ? `${code}: ${text}` : text || t("errors.network");
});
</script>
