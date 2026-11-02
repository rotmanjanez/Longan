<template>
	<UModal v-model:open="open" :title="t('upload.title')" :description="targetLabel" :ui="{ content: 'sm:max-w-2xl' }">
		<template #body>
			<div class="flex flex-col gap-4">
				<div
					class="relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 pointer-coarse:py-6 text-center transition-colors"
					:class="over ? 'border-primary bg-primary/10' : 'border-default'"
					data-upload-dropzone
					@dragenter.prevent.stop="over = true"
					@dragover.prevent.stop="over = true"
					@dragleave.prevent.stop="over = false"
					@drop.prevent.stop="onDrop"
				>
					<UIcon name="lucide:cloud-upload" class="size-10 text-dimmed" />
					<p class="text-sm text-muted pointer-coarse:hidden">{{ t("upload.drop_here") }}</p>
					<UButton color="neutral" variant="outline" icon="lucide:folder-open" @click="input?.click()">
						{{ t("upload.browse") }}
					</UButton>
					<p class="text-xs text-dimmed">{{ t("upload.limit", { size: formatBytes(config.uploadMaxBytes) }) }}</p>
					<input
						ref="input"
						type="file"
						multiple
						:accept="UPLOAD_ACCEPT"
						class="sr-only"
						tabindex="-1"
						:aria-label="t('upload.browse')"
						data-upload-input
						@change="onPick"
					/>
				</div>

				<div v-if="upload.items.length" class="flex flex-col gap-2">
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
						<span class="flex-1 basis-full sm:basis-auto text-muted" role="status" aria-live="polite">{{ summary }}</span>
						<UButton v-if="retryableCount" size="xs" color="neutral" variant="ghost" icon="lucide:rotate-cw" @click="upload.retryFailed()">
							{{ t("upload.retry_failed") }}
						</UButton>
						<UButton v-if="upload.isActive" size="xs" color="neutral" variant="ghost" icon="lucide:circle-stop" @click="upload.cancelAll()">
							{{ t("upload.cancel_all") }}
						</UButton>
						<UButton v-if="upload.done.length" size="xs" color="neutral" variant="ghost" icon="lucide:list-x" @click="upload.clearFinished()">
							{{ t("upload.clear") }}
						</UButton>
					</div>
					<UProgress :model-value="Math.round(upload.progress * 100)" size="sm" :color="upload.failed.length ? 'warning' : 'primary'" />
					<ul class="sm:max-h-80 sm:overflow-y-auto divide-y divide-default rounded-md ring ring-default" :aria-label="t('upload.queue')">
						<UploadRow v-for="item in upload.items" :key="item.id" :item="item" :max-bytes="config.uploadMaxBytes" @open="close" />
					</ul>
				</div>
			</div>
		</template>
	</UModal>

	<button
		v-if="!open && upload.items.length && (upload.isActive || upload.failed.length)"
		type="button"
		class="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] start-4 z-40 flex items-center gap-2 rounded-full bg-elevated ring ring-default px-4 py-2 shadow-lg text-sm hover:bg-accented"
		data-upload-pill
		@click="ui.openDialog('upload', { albumId: upload.targetAlbumId })"
	>
		<UIcon
			:name="upload.isActive ? 'lucide:loader-circle' : 'lucide:triangle-alert'"
			class="size-4"
			:class="upload.isActive ? 'animate-spin text-primary' : 'text-warning'"
		/>
		{{ summary }}
	</button>
</template>

<script setup lang="ts">
import { useToast } from "@nuxt/ui/composables";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { orpc } from "@/api/query.ts";
import { invalidateGallery, useDialog } from "@/components/dialogs/useDialog.ts";
import { useInit } from "@/composables/useInit.ts";
import { formatBytes } from "@/lib/format.ts";
import { useUiStore } from "@/stores/ui.ts";
import { UPLOAD_ACCEPT, useUploadStore } from "@/stores/upload.ts";
import UploadRow from "./UploadRow.vue";

const { t } = useI18n();
const ui = useUiStore();
const toast = useToast();
const queryClient = useQueryClient();
const upload = useUploadStore();
const { config } = useInit();
const input = ref<HTMLInputElement | null>(null);
const over = ref(false);

const { open, ctx, close } = useDialog("upload", () => {
	upload.targetAlbumId = ctx.value.albumId;
});

watch(config, (c) => upload.configure({ parallelism: c.uploadParallelism, maxBytes: c.uploadMaxBytes }), {
	immediate: true,
});

const stop = upload.onBatchDone((batch) => {
	void invalidateGallery({ albums: true, photos: true });
	const created = batch.filter((i) => i.status === "created").length;
	const dupes = batch.filter((i) => i.status === "duplicate").length;
	toast.add({
		title: t("upload.done_toast", { n: created }, created),
		description: dupes ? t("upload.duplicates", { n: dupes }, dupes) : undefined,
		color: "success",
		icon: "lucide:circle-check",
	});
});
onBeforeUnmount(stop);

const targetTitle = computed(() => {
	const id = upload.targetAlbumId;
	return id ? queryClient.getQueryData(orpc.albums.head.queryKey({ input: { id } }))?.title : null;
});
const targetLabel = computed(() =>
	upload.targetAlbumId
		? t("upload.target_album", { title: targetTitle.value ?? "…" })
		: t("upload.target_unsorted"),
);

const retryableCount = computed(
	() =>
		upload.items.filter((i) => (i.status === "error" || i.status === "cancelled") && i.retryable !== false)
			.length,
);
const summary = computed(() => {
	const total = upload.items.filter((i) => i.status !== "cancelled").length;
	const finished = upload.succeeded.length;
	const failed = upload.failed.length;
	return failed
		? t("upload.summary_failed", { done: finished, total, failed })
		: t("upload.summary", { done: finished, total });
});

function addFiles(list: FileList | File[] | null | undefined) {
	const files = Array.from(list ?? []);
	if (files.length) upload.enqueue(files, upload.targetAlbumId);
}
function onPick(e: Event) {
	const el = e.target as HTMLInputElement;
	addFiles(el.files);
	el.value = "";
}
function onDrop(e: DragEvent) {
	over.value = false;
	addFiles(e.dataTransfer?.files);
}
</script>
