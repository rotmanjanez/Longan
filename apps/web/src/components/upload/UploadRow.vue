<template>
	<li class="flex items-center gap-3 px-3 py-2" :data-upload-item="item.status">
		<UIcon
			:name="STATUS_ICONS[item.status]"
			class="size-5 shrink-0"
			:class="[STATUS_COLORS[item.status], item.status === 'uploading' ? 'animate-pulse' : '']"
		/>
		<div class="min-w-0 flex-1">
			<p class="text-sm truncate" :title="item.file.name">{{ item.file.name }}</p>
			<UProgress v-if="item.status === 'uploading'" :model-value="Math.round(item.progress * 100)" size="xs" class="mt-1" />
			<p v-else class="text-xs" :class="item.status === 'error' ? 'text-error' : 'text-muted'">
				{{ formatBytes(item.file.size) }} · {{ statusText }}
			</p>
		</div>
		<UButton
			v-if="(item.status === 'error' || item.status === 'cancelled') && item.retryable !== false"
			icon="lucide:rotate-cw"
			size="sm"
			color="neutral"
			variant="ghost"
			:aria-label="t('upload.retry', { name: item.file.name })"
			@click="upload.retry(item.id)"
		/>
		<UButton
			v-if="item.status === 'queued' || item.status === 'uploading'"
			icon="lucide:x"
			size="sm"
			color="neutral"
			variant="ghost"
			:aria-label="t('upload.cancel', { name: item.file.name })"
			@click="upload.cancel(item.id)"
		/>
		<UButton
			v-else-if="item.status === 'created' || item.status === 'duplicate'"
			icon="lucide:image"
			size="xs"
			color="neutral"
			variant="ghost"
			:to="photoRoute"
			:disabled="!photoRoute"
			:aria-label="t('upload.open', { name: item.file.name })"
			@click="emit('open')"
		/>
	</li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatBytes } from "@/lib/format.ts";
import { type UploadItem, type UploadStatus, useUploadStore } from "@/stores/upload.ts";

/**
 * One row of the upload queue. A separate component so that progress and status changes of one item
 * re-render only its row, not the whole (possibly hundreds of rows long) list.
 */
const props = defineProps<{ item: UploadItem; maxBytes: number }>();
const emit = defineEmits<{ open: [] }>();

const STATUS_ICONS: Record<UploadStatus, string> = {
	queued: "lucide:clock",
	uploading: "lucide:upload",
	created: "lucide:circle-check",
	duplicate: "lucide:copy-check",
	skipped: "lucide:circle-minus",
	error: "lucide:circle-x",
	cancelled: "lucide:circle-slash",
};
const STATUS_COLORS: Record<UploadStatus, string> = {
	queued: "text-dimmed",
	uploading: "text-primary",
	created: "text-success",
	duplicate: "text-info",
	skipped: "text-muted",
	error: "text-error",
	cancelled: "text-muted",
};

const { t, te } = useI18n();
const upload = useUploadStore();

const photoRoute = computed(() => {
	const { photoId, albumId } = props.item;
	return photoId && albumId ? { name: "album", params: { albumId, photoId } } : undefined;
});

const statusText = computed(() => {
	const item = props.item;
	if (item.status !== "error") return t(`upload.status.${item.status}`);
	const code = item.code ?? "";
	const known = te(`upload.errors.${code}`)
		? t(`upload.errors.${code}`, { size: formatBytes(props.maxBytes) })
		: code;
	return item.message ? `${known}: ${item.message}` : known || t("upload.status.error");
});
</script>
