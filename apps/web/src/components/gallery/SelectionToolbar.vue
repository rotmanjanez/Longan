<template>
	<div
		class="sticky top-(--app-header-bottom) z-30 flex items-center gap-1 px-2 sm:px-4 py-1.5 bg-default/85 backdrop-blur-md shadow-[0_1px_0_0_var(--ui-border)]"
		role="toolbar"
		:aria-label="t('selection.toolbar')"
		data-no-drag-select
	>
		<UButton icon="lucide:x" color="neutral" variant="ghost" :aria-label="t('selection.clear')" @click="emit('clear')" />
		<span class="min-w-0 truncate font-serif text-base text-highlighted me-2" aria-live="polite">
			{{ kind === "photos" ? t("selection.photos", count) : t("selection.albums", count) }}
		</span>
		<UButton
			color="neutral"
			variant="ghost"
			icon="lucide:square-check-big"
			:aria-label="t('selection.select_all')"
			@click="emit('selectAll')"
		>
			<span class="hidden md:inline">{{ t("selection.select_all") }}</span>
		</UButton>
		<div class="flex-1" />
		<div class="hidden sm:flex items-center gap-1">
			<UTooltip v-for="a in visible" :key="a.name" :text="t(`selection.actions.${a.name}`)">
				<UButton
					:icon="a.icon"
					:color="a.name === 'delete' ? 'error' : 'neutral'"
					variant="ghost"
					size="sm"
					:aria-label="t(`selection.actions.${a.name}`)"
					@click="emit('action', a.name)"
				/>
			</UTooltip>
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
		<UDropdownMenu v-if="menu.length" :items="menu" :content="{ align: 'end' }">
			<UButton class="sm:hidden" icon="lucide:ellipsis" color="neutral" variant="soft" :label="t('selection.actions_menu')" />
		</UDropdownMenu>
	</div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
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

/** Phones: the same actions as one labelled menu instead of a row of unlabelled icons. */
const menu = computed<DropdownMenuItem[][]>(() => {
	const items: DropdownMenuItem[] = visible.value
		.filter((a) => a.name !== "delete")
		.map((a) => ({
			label: t(`selection.actions.${a.name}`),
			icon: a.icon,
			onSelect: () => emit("action", a.name),
		}));
	if (props.rights.canDownload && props.downloadHref)
		items.push({
			label: t("selection.actions.download"),
			icon: "lucide:download",
			href: props.downloadHref,
			download: true,
			external: true,
		});
	const danger: DropdownMenuItem[] = visible.value.some((a) => a.name === "delete")
		? [
				{
					label: t("selection.actions.delete"),
					icon: "lucide:trash-2",
					color: "error",
					onSelect: () => emit("action", "delete"),
				},
			]
		: [];
	return [items, danger].filter((g) => g.length > 0);
});
</script>
