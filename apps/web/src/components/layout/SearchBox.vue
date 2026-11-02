<template>
	<form role="search" class="w-full" @submit.prevent="submit">
		<UInput
			ref="inputRef"
			v-model="term"
			type="search"
			icon="lucide:search"
			size="sm"
			variant="soft"
			class="w-full"
			:placeholder="t('search.placeholder')"
			:aria-label="t('search.label')"
		>
			<template #trailing>
				<UKbd value="/" class="hidden md:inline-flex" />
			</template>
		</UInput>
	</form>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const term = ref(typeof route.query.q === "string" ? route.query.q : "");
const inputRef = ref<{ inputRef?: HTMLInputElement } | null>(null);

watch(
	() => route.query.q,
	(q) => {
		if (route.name === "search") term.value = typeof q === "string" ? q : "";
	},
);

function submit() {
	const q = term.value.trim();
	if (q) router.push({ name: "search", query: { q } });
}

function focus() {
	inputRef.value?.inputRef?.focus();
}

defineExpose({ focus });
</script>
