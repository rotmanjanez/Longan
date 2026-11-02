<template>
	<div class="flex flex-col items-center justify-center gap-3 py-24 text-muted" role="status">
		<UIcon name="lucide:loader-circle" class="size-6 animate-spin" />
		<p>{{ t("user.redirecting") }}</p>
		<UButton color="neutral" variant="ghost" :href="target" external>{{ t("user.sign_in") }}</UButton>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { loginUrl } from "@/api/errors.ts";

const { t } = useI18n();
const route = useRoute();
/** Only same-origin paths are accepted as redirect targets. */
const target = computed(() => {
	const r = route.query.redirect;
	return loginUrl(typeof r === "string" && r.startsWith("/") && !r.startsWith("//") ? r : "/");
});
onMounted(() => window.location.replace(target.value));
</script>
