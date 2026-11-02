<template>
	<section :aria-labelledby="headingId" class="flex flex-col gap-3">
		<h2 :id="headingId" class="text-sm font-semibold uppercase tracking-wide text-muted">{{ title }}</h2>
		<slot />
	</section>
</template>

<script setup lang="ts">
import { useId } from "vue";

defineProps<{ title: string }>();
const headingId = useId();
</script>
