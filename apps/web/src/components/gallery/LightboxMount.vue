<template>
	<PhotoLightbox v-bind="props" @close="emit('close')" @navigate="(id) => emit('navigate', id)" />
</template>

<script setup lang="ts">
import PhotoLightbox from "@/components/photo/PhotoLightbox.vue";
import type { LightboxProps } from "./lightbox.ts";

const props = defineProps<LightboxProps>();
const emit = defineEmits<{ close: []; navigate: [photoId: string] }>();
</script>
