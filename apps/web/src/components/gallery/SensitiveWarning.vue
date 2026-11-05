<template>
	<div class="flex flex-col items-center justify-center gap-4 py-24 px-6 text-center" role="alert">
		<UIcon name="lucide:shield-alert" class="size-10 stroke-[1.25] text-muted" />
		<h2 class="display text-3xl text-highlighted">{{ t("gallery.nsfw.title") }}</h2>
		<p class="max-w-md text-muted text-pretty">{{ t("gallery.nsfw.description") }}</p>
		<div class="flex gap-2">
			<UButton color="neutral" variant="ghost" to="/">{{ t("gallery.nsfw.leave") }}</UButton>
			<UButton color="neutral" variant="outline" icon="lucide:eye" @click="emit('consent')">
				{{ t("gallery.nsfw.continue") }}
			</UButton>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const emit = defineEmits<{ consent: [] }>();
const { t } = useI18n();
</script>
