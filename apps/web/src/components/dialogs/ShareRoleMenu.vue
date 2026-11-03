<template>
	<UDropdownMenu :items="items" :content="{ align: 'end' }">
		<UButton
			color="neutral"
			variant="ghost"
			trailing-icon="lucide:chevron-down"
			:loading="loading"
			:aria-label="t('sharing.role_of', { name })"
			class="shrink-0"
		>
			{{ t(`sharing.roles.${role}`) }}
		</UButton>
	</UDropdownMenu>
</template>

<script setup lang="ts">
import type { ShareGrants } from "@longan/shared";
import type { DropdownMenuItem } from "@nuxt/ui";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ROLE_KEYS, ROLES, roleOf } from "./grants.ts";

/** What one person may do in a shared album: a preset, plus "Remove access" in the same menu. */
const props = defineProps<{ grants: ShareGrants; name: string; loading?: boolean }>();
const emit = defineEmits<{ update: [grants: ShareGrants]; remove: [] }>();
const { t } = useI18n();

const role = computed(() => roleOf(props.grants));
const items = computed<DropdownMenuItem[][]>(() => [
	ROLE_KEYS.map((r) => ({
		label: t(`sharing.roles.${r}`),
		description: t(`sharing.roles.${r}_hint`),
		type: "checkbox" as const,
		checked: role.value === r,
		onSelect: () => role.value !== r && emit("update", { ...ROLES[r] }),
	})),
	[
		{
			label: t("sharing.remove_access"),
			icon: "lucide:user-x",
			color: "error",
			onSelect: () => emit("remove"),
		},
	],
]);
</script>
