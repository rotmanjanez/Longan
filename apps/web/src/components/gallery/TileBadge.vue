<template>
	<span
		class="inline-flex size-6 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/25"
		:title="label"
		role="img"
		:aria-label="label"
	>
		<UIcon :name="icon" class="size-3.5" />
	</span>
</template>

<script setup lang="ts">
defineProps<{ icon: string; label: string }>();
</script>
