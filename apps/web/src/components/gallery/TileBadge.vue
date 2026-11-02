<template>
	<span
		class="inline-flex items-center justify-center ms-1 px-1.5 pt-1.5 pb-1 rounded-b-md border border-t-0 border-white/80 text-white shadow-sm"
		:class="BADGE_BG[role]"
		:title="label"
		role="img"
		:aria-label="label"
	>
		<UIcon :name="icon" class="size-3.5" />
	</span>
</template>

<script setup lang="ts">
import { BADGE_BG, type BadgeRole } from "@/lib/badges.ts";

defineProps<{ role: BadgeRole; icon: string; label: string }>();
</script>
