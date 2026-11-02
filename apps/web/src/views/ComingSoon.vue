<template>
	<!-- Placeholder for routes implemented by the second web agent (sharing, admin). See router/index.ts. -->
	<div class="px-3 sm:px-6 lg:px-8 py-6">
		<UEmpty icon="lucide:construction" :title="title" :description="t('app.coming_soon')" />
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

const { t } = useI18n();
const route = useRoute();
const title = computed(() => (route.meta.title ? t(route.meta.title) : ""));
</script>
