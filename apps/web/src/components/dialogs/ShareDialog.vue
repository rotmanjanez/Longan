<template>
	<UModal v-model:open="open" :title="t('dialogs.share.title')" :description="head?.title">
		<template #body>
			<div class="flex flex-col gap-6">
				<section class="flex flex-col gap-2">
					<UInputMenu
						v-model:search-term="term"
						:model-value="undefined"
						:items="userItems"
						ignore-filter
						:loading="users.isFetching.value || add.isPending.value"
						icon="lucide:user-plus"
						:placeholder="t('dialogs.share.search')"
						:aria-label="t('dialogs.share.search')"
						class="w-full"
						@update:model-value="addUser"
					/>
					<ul class="flex flex-col" :aria-label="t('dialogs.share.current')">
						<li v-if="head?.ownerName" class="flex items-center gap-3 py-1.5">
							<UAvatar :alt="head.ownerName" size="md" />
							<p class="min-w-0 flex-1 text-sm font-medium truncate">{{ head.ownerName }}</p>
							<span class="text-sm text-muted px-2.5">{{ t("sharing.roles.owner") }}</span>
						</li>
						<li v-for="g in grants.data.value ?? []" :key="g.id" class="flex items-center gap-3 py-1.5" :data-grant-row="g.id">
							<UAvatar :alt="g.user.displayName" size="md" />
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium truncate">{{ g.user.displayName }}</p>
								<p class="text-xs text-muted truncate">@{{ g.user.username }}</p>
							</div>
							<ShareRoleMenu
								:grants="pickGrants(g)"
								:name="g.user.displayName"
								:loading="busyId === g.id"
								@update="(v) => update.mutate({ id: g.id, grants: v })"
								@remove="remove.mutate({ ids: [g.id] })"
							/>
						</li>
					</ul>
				</section>

				<section v-if="head?.protection" class="flex flex-col gap-2">
					<h3 class="text-sm font-medium text-muted">{{ t("dialogs.share.access") }}</h3>
					<div class="flex items-center gap-2">
						<USelect
							:model-value="access"
							:items="accessItems"
							:icon="ACCESS_ICONS[access]"
							:loading="setAccess.isPending.value"
							:aria-label="t('dialogs.share.access')"
							class="flex-1 min-w-0"
							@update:model-value="(v: Access) => changeAccess(v)"
						/>
						<UButton color="neutral" variant="soft" icon="lucide:link" :aria-label="t('dialogs.share.copy_link')" @click="copyLink">
							<span class="max-sm:hidden">{{ t("dialogs.share.copy_link") }}</span>
						</UButton>
					</div>
					<p class="text-sm text-muted">
						{{ t(`dialogs.share.access_hint.${access}`) }}
						<UButton v-if="access !== 'private'" variant="link" class="p-0 align-baseline" @click="openProtection">
							{{ t("dialogs.share.visitor_options") }}
						</UButton>
					</p>
				</section>
			</div>
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
import { DEFAULT_GRANTS, pickGrants } from "./grants.ts";
import ShareRoleMenu from "./ShareRoleMenu.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

const { t } = useI18n();
const ui = useUiStore();
const router = useRouter();
const toast = useToast();
const { user } = useInit();
const term = ref("");
const { open, ctx, close } = useDialog("share", () => {
	term.value = "";
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
	const taken = new Set([...(grants.data.value ?? []).map((g) => g.user.id), user.value?.id]);
	return (users.data.value ?? [])
		.filter((u) => !taken.has(u.id))
		.map((u) => ({ label: u.displayName, description: `@${u.username}`, value: u.id, user: u }));
});

/** Picking a person shares right away as "Can view"; the role can be changed in their row. */
function addUser(item: unknown) {
	const u = (item as { user?: UserPublic } | null)?.user;
	term.value = "";
	if (!u || !albumId.value) return;
	add.mutate({ albumIds: [albumId.value], userIds: [u.id], grants: { ...DEFAULT_GRANTS } });
}

// No success toasts: the person list itself shows the result.
const add = useApiAction(
	(v: { albumIds: string[]; userIds: number[]; grants: ShareGrants }) => client.sharing.add(v),
	{ invalidate: () => ({ sharing: true }) },
);
const update = useApiAction((v: { id: number; grants: ShareGrants }) => client.sharing.update(v), {
	invalidate: () => ({ sharing: true }),
});
const remove = useApiAction((v: { ids: number[] }) => client.sharing.remove(v), {
	invalidate: () => ({ sharing: true }),
});
const busyId = computed(() =>
	update.isPending.value
		? update.variables.value?.id
		: remove.isPending.value
			? remove.variables.value?.ids[0]
			: undefined,
);

type Access = "private" | "signed_in" | "link" | "public";
const ACCESS_ICONS: Record<Access, string> = {
	private: "lucide:lock",
	signed_in: "lucide:users",
	link: "lucide:link",
	public: "lucide:globe",
};
const access = computed<Access>(() => {
	const p = head.value?.protection;
	if (!p?.isPublic) return "private";
	if (p.requiresLogin) return "signed_in";
	return p.isLinkRequired ? "link" : "public";
});
const accessItems = computed(() =>
	(["private", "signed_in", "link", "public"] as const).map((a) => ({
		value: a,
		label: t(`dialogs.share.access_mode.${a}`),
		icon: ACCESS_ICONS[a],
	})),
);
const setAccess = useApiAction(
	(v: Parameters<typeof client.albums.setProtection>[0]) => client.albums.setProtection(v),
	{
		invalidate: () => ({ albums: true }),
	},
);
/** Switches who can open the album; visitor permissions and password are kept (sensible defaults when it was private). */
function changeAccess(next: Access) {
	const h = head.value;
	const p = h?.protection;
	if (!h || !p || next === access.value) return;
	const was = p.isPublic;
	setAccess.mutate({
		id: h.id,
		isPublic: next !== "private",
		isLinkRequired: next === "link",
		requiresLogin: next === "signed_in",
		isNsfw: h.isNsfw,
		grantsFullPhotoAccess: was ? p.grantsFullPhotoAccess : true,
		grantsDownload: was ? p.grantsDownload : false,
		grantsUpload: was ? p.grantsUpload : false,
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
