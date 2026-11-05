<template>
	<section :aria-labelledby="headingId" class="flex flex-col gap-5">
		<h2 :id="headingId" class="display text-xl text-toned">{{ title }}</h2>
		<slot />
	</section>
</template>

<script setup lang="ts">
import { useId } from "vue";

defineProps<{ title: string }>();
const headingId = useId();
</script>
