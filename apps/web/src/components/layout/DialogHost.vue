<template>
	<!--
		Global dialog mount point. Every dialog/drawer is driven by a flag in the ui store
		(`ui.dialogs[name]`, context in `ui.dialogContext`, see stores/ui.ts DIALOG_NAMES).

		SECOND WEB AGENT: mount the dialogs from components/{dialogs,upload,sharing,photo} here, e.g.
			<MoveDialog />      reads ui.dialogs.move + ui.dialogContext
			<UploadPanel />     reads ui.dialogs.upload + upload store
	-->
	<UnlockDialog />
	<KeybindingsHelp />
</template>

<script setup lang="ts">
import UnlockDialog from "@/components/gallery/UnlockDialog.vue";
import KeybindingsHelp from "./KeybindingsHelp.vue";
</script>
