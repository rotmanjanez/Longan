<template>
	<!-- Placeholder for routes implemented by the second web agent (sharing, admin). See router/index.ts. -->
	<div class="px-4 sm:px-8 lg:px-12 pt-8 pb-16">
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
