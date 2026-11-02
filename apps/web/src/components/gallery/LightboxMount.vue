<template>
	<!-- SECOND WEB AGENT: swap PhotoPanelPlaceholder for the real lightbox (same props/events, see lightbox.ts). -->
	<PhotoPanelPlaceholder v-bind="props" @close="emit('close')" @navigate="(id) => emit('navigate', id)" />
</template>

<script setup lang="ts">
import type { LightboxProps } from "./lightbox.ts";
import PhotoPanelPlaceholder from "./PhotoPanelPlaceholder.vue";

const props = defineProps<LightboxProps>();
const emit = defineEmits<{ close: []; navigate: [photoId: string] }>();
</script>
