<template>
	<div class="px-3 sm:px-6 lg:px-8 py-6">
		<UEmpty
			icon="lucide:map-pin-off"
			:title="t('errors.not_found')"
			:actions="[{ label: t('nav.gallery'), icon: 'lucide:images', color: 'neutral', variant: 'outline', to: '/' }]"
		/>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>
