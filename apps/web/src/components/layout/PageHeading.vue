<template>
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-end gap-x-4 gap-y-3">
			<h1 class="display text-3xl sm:text-4xl text-highlighted flex-1 min-w-0 truncate">{{ title }}</h1>
			<div v-if="$slots.default" class="flex flex-wrap items-center gap-1 -mb-0.5" data-no-drag-select>
				<slot />
			</div>
		</div>
		<p v-if="description" class="max-w-xl text-sm text-muted text-pretty">{{ description }}</p>
	</div>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>
