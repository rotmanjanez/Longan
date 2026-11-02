<template>
	<UModal v-model:open="open" :title="t('dialogs.share.title')" :description="head?.title" :ui="{ content: 'sm:max-w-2xl' }">
		<template #body>
			<div class="flex flex-col gap-5">
				<div class="flex flex-wrap items-center gap-2">
					<UBadge
						v-if="head?.protection"
						:color="head.protection.isPublic ? 'success' : 'neutral'"
						variant="soft"
						:icon="head.protection.isPublic ? 'lucide:eye' : 'lucide:eye-off'"
					>
						{{ head.protection.isPublic ? (head.protection.isLinkRequired ? t("gallery.badges.link") : t("gallery.badges.public")) : t("dialogs.share.private") }}
					</UBadge>
					<span class="flex-1" />
					<UButton size="sm" color="neutral" variant="ghost" icon="lucide:link" @click="copyLink">{{ t("dialogs.share.copy_link") }}</UButton>
					<UButton v-if="head?.protection" size="sm" color="neutral" variant="outline" icon="lucide:eye" @click="openProtection">
						{{ t("dialogs.album_edit.visibility") }}
					</UButton>
				</div>

				<section>
					<h3 class="text-sm font-semibold mb-2">{{ t("dialogs.share.current") }}</h3>
					<p v-if="grants.isPending.value" class="text-sm text-muted">{{ t("app.loading") }}</p>
					<p v-else-if="!grants.data.value?.length" class="text-sm text-muted">{{ t("dialogs.share.none") }}</p>
					<ul v-else class="divide-y divide-default rounded-md ring ring-default">
						<li v-for="g in grants.data.value" :key="g.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" :data-grant-row="g.id">
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium truncate">{{ g.user.displayName }}</p>
								<p class="text-xs text-muted truncate">@{{ g.user.username }}</p>
							</div>
							<GrantCheckboxes
								compact
								:model-value="pickGrants(g)"
								:label="g.user.displayName"
								:disabled="update.isPending.value"
								@update:model-value="(v) => update.mutate({ id: g.id, grants: v })"
							/>
							<UButton
								icon="lucide:user-x"
								size="sm"
								color="error"
								variant="ghost"
								:aria-label="t('dialogs.share.remove', { name: g.user.displayName })"
								:loading="remove.isPending.value && remove.variables.value?.ids[0] === g.id"
								@click="remove.mutate({ ids: [g.id] })"
							/>
						</li>
					</ul>
				</section>

				<form id="share-form" class="flex flex-col gap-3" @submit.prevent="submit">
					<h3 class="text-sm font-semibold">{{ t("dialogs.share.add") }}</h3>
					<UInputMenu
						v-model:search-term="term"
						:model-value="undefined"
						:items="userItems"
						ignore-filter
						:loading="users.isFetching.value"
						icon="lucide:user-search"
						:placeholder="t('dialogs.share.search')"
						class="w-full"
						@update:model-value="addUser"
					/>
					<div v-if="picked.length" class="flex flex-wrap gap-1.5">
						<UBadge v-for="u in picked" :key="u.id" color="neutral" variant="soft">
							{{ u.displayName }}
							<button type="button" class="ms-0.5 hover:text-error" :aria-label="t('dialogs.share.unpick', { name: u.displayName })" @click="unpick(u.id)">
								<UIcon name="lucide:x" class="size-3.5" />
							</button>
						</UBadge>
					</div>
					<GrantCheckboxes v-model="newGrants" :label="t('dialogs.share.add')" />
				</form>
			</div>
		</template>
		<template #footer>
			<DialogActions
				form="share-form"
				:confirm-label="t('dialogs.share.submit')"
				:cancel-label="t('common.close')"
				icon="lucide:user-plus"
				:loading="add.isPending.value"
				:disabled="picked.length === 0"
				@cancel="close"
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import type { ShareGrants, UserPublic } from "@longan/shared";
import { useToast } from "@nuxt/ui/composables";
import { useQuery } from "@tanstack/vue-query";
import { refDebounced, useClipboard } from "@vueuse/core";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { client } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";
import { useInit } from "@/composables/useInit.ts";
import { useUiStore } from "@/stores/ui.ts";
import DialogActions from "./DialogActions.vue";
import GrantCheckboxes from "./GrantCheckboxes.vue";
import { DEFAULT_GRANTS, pickGrants } from "./grants.ts";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const ui = useUiStore();
const router = useRouter();
const toast = useToast();
const { user } = useInit();
const term = ref("");
const picked = ref<UserPublic[]>([]);
const newGrants = ref<ShareGrants>({ ...DEFAULT_GRANTS });
const { open, ctx, close } = useDialog("share", () => {
	term.value = "";
	picked.value = [];
	newGrants.value = { ...DEFAULT_GRANTS };
});

const albumId = computed(() => ctx.value.albumIds[0] ?? ctx.value.albumId ?? "");
const headQuery = useQuery(
	computed(() =>
		orpc.albums.head.queryOptions({ input: { id: albumId.value }, enabled: open.value && !!albumId.value }),
	),
);
const head = computed(() => (open.value ? headQuery.data.value : undefined));
const grants = useQuery(
	computed(() =>
		orpc.sharing.list.queryOptions({
			input: { albumId: albumId.value },
			enabled: open.value && !!albumId.value,
		}),
	),
);

const debounced = refDebounced(term, 250);
const users = useQuery(
	computed(() =>
		orpc.users.search.queryOptions({
			input: { term: debounced.value.trim() },
			enabled: open.value && debounced.value.trim().length > 0,
		}),
	),
);
const userItems = computed(() => {
	const taken = new Set([
		...picked.value.map((u) => u.id),
		...(grants.data.value ?? []).map((g) => g.user.id),
		user.value?.id,
	]);
	return (users.data.value ?? [])
		.filter((u) => !taken.has(u.id))
		.map((u) => ({ label: u.displayName, description: `@${u.username}`, value: u.id, user: u }));
});

function addUser(item: unknown) {
	const u = (item as { user?: UserPublic } | null)?.user;
	if (u && !picked.value.some((p) => p.id === u.id)) picked.value = [...picked.value, u];
	term.value = "";
}
function unpick(id: number) {
	picked.value = picked.value.filter((u) => u.id !== id);
}

const add = useApiAction(
	(v: { albumIds: string[]; userIds: number[]; grants: ShareGrants }) => client.sharing.add(v),
	{
		invalidate: () => ({ sharing: true }),
		success: (v) => t("dialogs.share.done", v.userIds.length),
		after: () => {
			picked.value = [];
		},
	},
);
const update = useApiAction((v: { id: number; grants: ShareGrants }) => client.sharing.update(v), {
	invalidate: () => ({ sharing: true }),
});
const remove = useApiAction((v: { ids: number[] }) => client.sharing.remove(v), {
	invalidate: () => ({ sharing: true }),
	success: () => t("dialogs.share.removed"),
});

function submit() {
	if (!picked.value.length || !albumId.value) return;
	add.mutate({
		albumIds: [albumId.value],
		userIds: picked.value.map((u) => u.id),
		grants: { ...newGrants.value },
	});
}

const { copy } = useClipboard({ legacy: true });
async function copyLink() {
	const href = new URL(
		router.resolve({ name: "album", params: { albumId: albumId.value } }).href,
		window.location.origin,
	).toString();
	await copy(href);
	toast.add({ title: t("lightbox.toast.link_copied"), color: "success", icon: "lucide:link" });
}
function openProtection() {
	const id = albumId.value;
	close();
	ui.openDialog("albumProtection", { albumId: id, albumIds: [id], photoIds: [] });
}
</script>
