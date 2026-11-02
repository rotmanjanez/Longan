<template>
	<div
		class="sticky top-(--ui-header-height) z-30 flex flex-wrap items-center gap-1 px-2 py-1.5 bg-default/85 backdrop-blur border-b border-default"
		role="toolbar"
		:aria-label="t('selection.toolbar')"
		data-no-drag-select
	>
		<UButton icon="lucide:x" color="neutral" variant="ghost" size="sm" :aria-label="t('selection.clear')" @click="emit('clear')" />
		<span class="text-sm font-medium text-highlighted me-2" aria-live="polite">
			{{ kind === "photos" ? t("selection.photos", count) : t("selection.albums", count) }}
		</span>
		<UButton color="neutral" variant="ghost" size="sm" icon="lucide:square-check-big" @click="emit('selectAll')">
			<span class="hidden md:inline">{{ t("selection.select_all") }}</span>
		</UButton>
		<div class="flex-1" />
		<template v-for="a in visible" :key="a.name">
			<UTooltip :text="t(`selection.actions.${a.name}`)">
				<UButton
					:icon="a.icon"
					:color="a.name === 'delete' ? 'error' : 'neutral'"
					variant="ghost"
					size="sm"
					:aria-label="t(`selection.actions.${a.name}`)"
					@click="emit('action', a.name)"
				/>
			</UTooltip>
		</template>
		<UTooltip v-if="rights.canDownload && downloadHref" :text="t('selection.actions.download')">
			<UButton
				icon="lucide:download"
				color="neutral"
				variant="ghost"
				size="sm"
				:href="downloadHref"
				download
				external
				:aria-label="t('selection.actions.download')"
			/>
		</UTooltip>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SelectionAction, SelectionRights } from "./selectionActions.ts";

const props = defineProps<{
	kind: "photos" | "albums";
	count: number;
	rights: SelectionRights;
	/** `/api/zip?...` link for the current selection. */
	downloadHref?: string;
}>();
const emit = defineEmits<{ action: [name: SelectionAction]; clear: []; selectAll: [] }>();
const { t } = useI18n();

type Def = { name: SelectionAction; icon: string; show: () => boolean };
const DEFS: Def[] = [
	{ name: "highlight", icon: "lucide:star", show: () => props.kind === "photos" && props.rights.canEdit },
	{ name: "tag", icon: "lucide:tag", show: () => props.kind === "photos" && props.rights.canEdit },
	{
		name: "rename",
		icon: "lucide:pencil",
		show: () => props.rights.canEdit && (props.kind === "photos" || props.count === 1),
	},
	{ name: "copy", icon: "lucide:copy", show: () => props.kind === "photos" && props.rights.canEdit },
	{ name: "move", icon: "lucide:folder-input", show: () => props.rights.canMove },
	{ name: "merge", icon: "lucide:merge", show: () => props.kind === "albums" && props.rights.canEdit },
	{ name: "delete", icon: "lucide:trash-2", show: () => props.rights.canDelete },
];
const visible = computed(() => DEFS.filter((d) => d.show()));
</script>
