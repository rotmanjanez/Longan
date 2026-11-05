<template>
	<div class="flex justify-center py-16" role="status">
		<div class="relative h-px w-24 overflow-hidden bg-accented">
			<div class="absolute inset-y-0 w-1/4 bg-highlighted animate-sweep motion-reduce:animate-none motion-reduce:w-full" />
		</div>
		<span class="sr-only">{{ t("app.loading") }}</span>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
