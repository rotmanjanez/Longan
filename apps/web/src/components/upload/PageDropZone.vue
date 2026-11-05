<template>
	<Teleport to="body">
		<div
			v-if="dragging"
			class="fixed inset-0 z-40 pointer-events-none flex items-center justify-center bg-default/60 backdrop-blur-sm ring-2 ring-inset ring-primary"
			role="status"
			data-page-drop
		>
			<div class="flex flex-col items-center gap-2 rounded-lg bg-default px-8 py-6 shadow-2xl shadow-black/15 text-center">
				<UIcon name="lucide:upload" class="size-7 stroke-[1.5] text-primary" />
				<p class="display text-2xl text-highlighted">{{ t("upload.drop_page") }}</p>
				<p class="text-sm text-muted">{{ targetTitle ?? t("upload.target_unsorted") }}</p>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useUiStore } from "@/stores/ui.ts";
import { useUploadStore } from "@/stores/upload.ts";
import { useFileDrop } from "./useFileDrop.ts";

/** Drop files anywhere on the page to upload them into `albumId` (null = unsorted) and show the queue. */
const props = defineProps<{ albumId: string | null; targetTitle?: string | null; enabled: boolean }>();
const { t } = useI18n();
const ui = useUiStore();
const upload = useUploadStore();

const { dragging } = useFileDrop(
	() => props.enabled && !ui.anyDialogOpen,
	(files) => {
		upload.enqueue(files, props.albumId);
		ui.openDialog("upload", { albumId: props.albumId });
	},
);
</script>
