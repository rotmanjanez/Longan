<template>
	<UModal v-model:open="open" :title="t('dialogs.album_edit.title')" :ui="{ content: 'sm:max-w-2xl' }">
		<template #body>
			<p v-if="!head" class="text-sm text-muted">{{ t("app.loading") }}</p>
			<form v-else id="album-edit-form" class="flex flex-col gap-4" @submit.prevent="submit">
				<UFormField :label="t('dialogs.fields.title')" required>
					<UInput v-model="form.title" class="w-full" maxlength="300" />
				</UFormField>
				<UFormField :label="t('dialogs.fields.description')">
					<UTextarea v-model="form.description" class="w-full" :rows="3" autoresize />
				</UFormField>
				<template v-if="isTag">
					<UFormField :label="t('dialogs.fields.tags')">
						<TagInput v-model="form.tags" />
					</UFormField>
					<UFormField :label="t('dialogs.fields.tag_logic')">
						<URadioGroup v-model="form.tagLogic" orientation="horizontal" :items="logicItems" />
					</UFormField>
				</template>
				<div class="grid sm:grid-cols-2 gap-4">
					<UFormField :label="t('dialogs.fields.photo_sorting')">
						<div class="flex gap-2">
							<USelect v-model="form.photoSortCol" :items="photoSortItems" class="flex-1 min-w-0" />
							<USelect v-model="form.photoSortOrder" :items="orderItems" :disabled="form.photoSortCol === DEFAULT_OPTION" class="w-28" />
						</div>
					</UFormField>
					<UFormField v-if="!isTag" :label="t('dialogs.fields.album_sorting')">
						<div class="flex gap-2">
							<USelect v-model="form.albumSortCol" :items="albumSortItems" class="flex-1 min-w-0" />
							<USelect v-model="form.albumSortOrder" :items="orderItems" :disabled="form.albumSortCol === DEFAULT_OPTION" class="w-28" />
						</div>
					</UFormField>
					<UFormField :label="t('dialogs.fields.layout')">
						<USelect v-model="form.layout" :items="layoutItems" class="w-full" />
					</UFormField>
					<UFormField :label="t('dialogs.fields.license')">
						<USelect v-model="form.license" :items="licenseItems" class="w-full" />
					</UFormField>
					<UFormField v-if="!isTag" :label="t('dialogs.fields.slug')" :error="slugError" :hint="t('dialogs.album_edit.slug_hint')">
						<UInput v-model="form.slug" class="w-full" placeholder="my-album" />
					</UFormField>
					<UFormField v-if="head.protection" :label="t('dialogs.fields.nsfw')" :description="t('dialogs.protection.nsfw_hint')">
						<USwitch v-model="form.isNsfw" />
					</UFormField>
				</div>
				<UFormField :label="t('dialogs.fields.cover')">
					<div class="flex items-center gap-3">
						<div class="size-16 shrink-0 rounded-lg overflow-hidden bg-elevated ring ring-default flex items-center justify-center">
							<img v-if="form.coverId" :src="assetUrl(albumId!, form.coverId, 'thumb')" alt="" class="size-full object-cover" />
							<UIcon v-else name="lucide:wand-sparkles" class="size-6 text-dimmed" />
						</div>
						<div class="flex flex-col items-start gap-1">
							<span class="text-sm text-muted">{{ form.coverId ? t("dialogs.album_edit.cover_chosen") : t("dialogs.album_edit.cover_auto") }}</span>
							<div class="flex gap-1">
								<UButton size="xs" color="neutral" variant="outline" icon="lucide:image" @click="coverOpen = !coverOpen">
									{{ t("dialogs.album_edit.cover_choose") }}
								</UButton>
								<UButton v-if="form.coverId" size="xs" color="neutral" variant="ghost" @click="form.coverId = null">
									{{ t("dialogs.album_edit.cover_reset") }}
								</UButton>
							</div>
						</div>
					</div>
					<div v-if="coverOpen" class="mt-2 max-h-60 overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5 p-1" role="listbox" :aria-label="t('dialogs.fields.cover')">
						<p v-if="photos.isPending.value" class="col-span-full text-sm text-muted">{{ t("app.loading") }}</p>
						<p v-else-if="!photos.data.value?.ids.length" class="col-span-full text-sm text-muted">{{ t("gallery.empty.album_title") }}</p>
						<button
							v-for="(pid, i) in photos.data.value?.ids.slice(0, 300) ?? []"
							:key="pid"
							type="button"
							role="option"
							:aria-selected="form.coverId === pid"
							:aria-label="photos.data.value?.titles[i] ?? pid"
							class="aspect-square rounded-md overflow-hidden outline-offset-1 focus-visible:outline-2 focus-visible:outline-primary"
							:class="form.coverId === pid ? 'outline-2 outline-primary' : ''"
							:style="{ backgroundColor: photos.data.value?.colours[i] ?? undefined }"
							@click="form.coverId = pid"
						>
							<img :src="assetUrl(albumId!, pid, 'thumb')" alt="" loading="lazy" class="size-full object-cover" />
						</button>
					</div>
				</UFormField>
			</form>
		</template>
		<template #footer>
			<DialogActions
				form="album-edit-form"
				:confirm-label="t('dialogs.save')"
				icon="lucide:check"
				:loading="save.isPending.value"
				:disabled="!head || !form.title.trim() || !!slugError"
				@cancel="close"
			>
				<template #start>
					<template v-if="head">
						<UButton v-if="head.protection" color="neutral" variant="ghost" icon="lucide:eye" @click="switchTo('albumProtection')">
							<span class="hidden sm:inline">{{ t("dialogs.album_edit.visibility") }}</span>
						</UButton>
						<UButton v-if="head.rights.canMove && !isTag" color="neutral" variant="ghost" icon="lucide:folder-input" @click="switchTo('move')">
							<span class="hidden sm:inline">{{ t("dialogs.move.submit") }}</span>
						</UButton>
						<UButton v-if="head.rights.canDelete" color="error" variant="ghost" icon="lucide:trash-2" @click="switchTo('delete')">
							<span class="hidden sm:inline">{{ t("dialogs.delete.submit") }}</span>
						</UButton>
					</template>
				</template>
			</DialogActions>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import type { AlbumHead } from "@longan/shared";
import { useQuery } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { assetUrl } from "@/api/assets.ts";
import { client } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";
import {
	ALBUM_SORT_COLS,
	DEFAULT_OPTION,
	LICENSES,
	licenseKey,
	PHOTO_LAYOUTS,
	PHOTO_SORT_COLS,
} from "@/lib/options.ts";
import { useUiStore } from "@/stores/ui.ts";
import DialogActions from "./DialogActions.vue";
import TagInput from "./TagInput.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

type Patch = Parameters<typeof client.albums.update>[0]["patch"];
const SLUG_RE = /^[a-z0-9-]{1,100}$/;

const { t } = useI18n();
const ui = useUiStore();
const coverOpen = ref(false);
const form = reactive({
	title: "",
	description: "",
	slug: "",
	license: DEFAULT_OPTION as string,
	photoSortCol: DEFAULT_OPTION as string,
	photoSortOrder: "desc" as "asc" | "desc",
	albumSortCol: DEFAULT_OPTION as string,
	albumSortOrder: "desc" as "asc" | "desc",
	layout: DEFAULT_OPTION as string,
	isNsfw: false,
	coverId: null as string | null,
	tags: [] as string[],
	tagLogic: "or" as "or" | "and",
});
const { open, ctx, close } = useDialog("albumEdit", () => {
	coverOpen.value = false;
});

const albumId = computed(() => ctx.value.albumIds[0] ?? ctx.value.albumId);
const headQuery = useQuery(
	computed(() =>
		orpc.albums.head.queryOptions({
			input: { id: albumId.value ?? "" },
			enabled: open.value && !!albumId.value,
		}),
	),
);
const head = computed<AlbumHead | undefined>(() => (open.value ? headQuery.data.value : undefined));
const isTag = computed(() => head.value?.kind === "tag");
const photos = useQuery(
	computed(() =>
		orpc.photos.ratios.queryOptions({
			input: { album: albumId.value ?? "" },
			enabled: open.value && coverOpen.value && !!albumId.value,
		}),
	),
);

watch(
	() => [open.value, head.value] as const,
	([isOpen, h]) => {
		if (!isOpen || !h) return;
		Object.assign(form, {
			title: h.title,
			description: h.description ?? "",
			slug: h.slug ?? "",
			license: h.license ?? DEFAULT_OPTION,
			photoSortCol: h.photoSorting?.col ?? DEFAULT_OPTION,
			photoSortOrder: h.photoSorting?.order ?? "desc",
			albumSortCol: h.albumSorting?.col ?? DEFAULT_OPTION,
			albumSortOrder: h.albumSorting?.order ?? "desc",
			layout: h.photoLayout ?? DEFAULT_OPTION,
			isNsfw: h.isNsfw,
			coverId: h.coverId,
			tags: h.tags.map((tag) => tag.name),
			tagLogic: h.tagLogic ?? "or",
		});
	},
	{ immediate: true },
);

const withDefault = (prefix: string, values: readonly string[]) => [
	{ label: t("dialogs.default"), value: DEFAULT_OPTION },
	...values.map((v) => ({ label: t(`${prefix}.${v}`), value: v })),
];
const photoSortItems = computed(() => withDefault("sorting.photo", PHOTO_SORT_COLS));
const albumSortItems = computed(() => withDefault("sorting.album", ALBUM_SORT_COLS));
const layoutItems = computed(() => withDefault("gallery.layout", PHOTO_LAYOUTS));
const licenseItems = computed(() => [
	{ label: t("dialogs.default"), value: DEFAULT_OPTION },
	...LICENSES.map((l) => ({ label: t(licenseKey(l)), value: l })),
]);
const orderItems = computed(() => [
	{ label: t("sorting.asc"), value: "asc" },
	{ label: t("sorting.desc"), value: "desc" },
]);
const logicItems = computed(() => [
	{ label: t("dialogs.tag_logic.or"), value: "or" },
	{ label: t("dialogs.tag_logic.and"), value: "and" },
]);
const slugError = computed(() =>
	form.slug && !SLUG_RE.test(form.slug) ? t("dialogs.album_edit.slug_invalid") : undefined,
);

function switchTo(name: "albumProtection" | "move" | "delete") {
	const id = albumId.value;
	if (!id) return;
	close();
	ui.openDialog(name, { albumId: head.value?.parentId ?? null, albumIds: [id], photoIds: [] });
}

function buildPatch(h: AlbumHead): Patch {
	const patch: Patch = {};
	if (form.title.trim() !== h.title) patch.title = form.title.trim();
	const desc = form.description.trim() || null;
	if (desc !== (h.description ?? null)) patch.description = desc;
	const license = form.license === DEFAULT_OPTION ? null : (form.license as Patch["license"]);
	if (license !== (h.license ?? null)) patch.license = license;
	if (!isTag.value) {
		const slug = form.slug.trim() || null;
		if (slug !== (h.slug ?? null)) patch.slug = slug;
	}
	const ps =
		form.photoSortCol === DEFAULT_OPTION ? null : { col: form.photoSortCol, order: form.photoSortOrder };
	if (JSON.stringify(ps) !== JSON.stringify(h.photoSorting ?? null))
		patch.photoSorting = ps as Patch["photoSorting"];
	if (!isTag.value) {
		const as =
			form.albumSortCol === DEFAULT_OPTION ? null : { col: form.albumSortCol, order: form.albumSortOrder };
		if (JSON.stringify(as) !== JSON.stringify(h.albumSorting ?? null))
			patch.albumSorting = as as Patch["albumSorting"];
	}
	const layout = form.layout === DEFAULT_OPTION ? null : (form.layout as Patch["photoLayout"]);
	if (layout !== (h.photoLayout ?? null)) patch.photoLayout = layout;
	if (form.coverId !== h.coverId) patch.coverId = form.coverId;
	if (isTag.value) {
		const before = h.tags.map((tag) => tag.name).sort();
		if ([...form.tags].sort().join("\u0000") !== before.join("\u0000")) patch.tagNames = [...form.tags];
		if (form.tagLogic !== (h.tagLogic ?? "or")) patch.tagLogic = form.tagLogic;
	}
	return patch;
}

const save = useApiAction(
	async (v: { head: AlbumHead; patch: Patch; isNsfw: boolean }) => {
		if (Object.keys(v.patch).length) await client.albums.update({ id: v.head.id, patch: v.patch });
		const p = v.head.protection;
		if (p && v.isNsfw !== v.head.isNsfw) {
			await client.albums.setProtection({
				id: v.head.id,
				isPublic: p.isPublic,
				isLinkRequired: p.isLinkRequired,
				isNsfw: v.isNsfw,
				grantsFullPhotoAccess: p.grantsFullPhotoAccess,
				grantsDownload: p.grantsDownload,
				grantsUpload: p.grantsUpload,
			});
		}
	},
	{
		invalidate: (v) => ({
			albums: true,
			photos: !!(v.patch.photoSorting !== undefined || v.patch.tagNames || v.patch.tagLogic),
		}),
		success: () => t("dialogs.album_edit.done"),
		after: () => close(),
	},
);

function submit() {
	const h = head.value;
	if (!h || slugError.value || !form.title.trim()) return;
	save.mutate({ head: h, patch: buildPatch(h), isNsfw: form.isNsfw });
}
</script>
