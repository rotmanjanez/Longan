<template>
	<UModal v-model:open="open" :title="t('lightbox.details_title')" :ui="{ body: 'p-0 sm:p-0' }">
		<template #body>
			<PhotoDetailsPanel v-if="photo" :album-ctx="albumCtx" :detail="photo" />
			<p v-else class="p-4 text-sm text-muted">{{ t("app.loading") }}</p>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import PhotoDetailsPanel from "@/components/photo/PhotoDetailsPanel.vue";
import { usePhotoDetails } from "@/composables/usePhotoDetails.ts";
import { useAlbumCtx, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const albumCtx = useAlbumCtx();
const { open, ctx } = useDialog("photoDetails");
const id = computed(() => (open.value ? (ctx.value.photoIds[0] ?? null) : null));
const { details } = usePhotoDetails(albumCtx, () => (id.value ? [id.value] : []));
const photo = computed(() => (id.value ? details.value.get(id.value) : undefined));
</script>
