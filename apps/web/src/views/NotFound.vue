<template>
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16">
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
