<template>
	<!--
		Global dialog mount point. Every dialog/drawer is driven by a flag in the ui store
		(`ui.dialogs[name]`, context in `ui.dialogContext`, see stores/ui.ts DIALOG_NAMES).
	-->
	<UnlockDialog />
	<KeybindingsHelp />
	<UploadDialog />
	<CreateAlbumDialog />
	<CreateTagAlbumDialog />
	<AlbumEditDialog />
	<AlbumProtectionDialog />
	<ShareDialog />
	<MoveDialog />
	<CopyDialog />
	<MergeDialog />
	<RenameDialog />
	<DeleteDialog />
	<TagDialog />
	<PhotoEditDialog />
	<PhotoDetailsDialog />
</template>

<script setup lang="ts">
import AlbumEditDialog from "@/components/dialogs/AlbumEditDialog.vue";
import AlbumProtectionDialog from "@/components/dialogs/AlbumProtectionDialog.vue";
import CopyDialog from "@/components/dialogs/CopyDialog.vue";
import CreateAlbumDialog from "@/components/dialogs/CreateAlbumDialog.vue";
import CreateTagAlbumDialog from "@/components/dialogs/CreateTagAlbumDialog.vue";
import DeleteDialog from "@/components/dialogs/DeleteDialog.vue";
import MergeDialog from "@/components/dialogs/MergeDialog.vue";
import MoveDialog from "@/components/dialogs/MoveDialog.vue";
import PhotoDetailsDialog from "@/components/dialogs/PhotoDetailsDialog.vue";
import PhotoEditDialog from "@/components/dialogs/PhotoEditDialog.vue";
import RenameDialog from "@/components/dialogs/RenameDialog.vue";
import ShareDialog from "@/components/dialogs/ShareDialog.vue";
import TagDialog from "@/components/dialogs/TagDialog.vue";
import UnlockDialog from "@/components/gallery/UnlockDialog.vue";
import UploadDialog from "@/components/upload/UploadDialog.vue";
import KeybindingsHelp from "./KeybindingsHelp.vue";
</script>
