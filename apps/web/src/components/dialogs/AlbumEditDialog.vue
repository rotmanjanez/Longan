<template>
	<UModal v-model:open="open" :close="false" :title="t('dialogs.album_edit.title')">
		<template #body>
			<p v-if="!head" class="text-sm text-muted">{{ t("app.loading") }}</p>
			<form v-else id="album-edit-form" class="flex flex-col gap-4" @submit.prevent="submit">
				<div class="flex items-end gap-3">
					<button
						type="button"
						class="relative size-[4.5rem] shrink-0 rounded-xl overflow-hidden bg-elevated flex items-center justify-center focus-visible:outline-2 focus-visible:outline-primary"
						:aria-label="t('dialogs.album_edit.cover_choose')"
						:aria-expanded="coverOpen"
						@click="coverOpen = !coverOpen"
					>
						<img
							v-if="form.coverId"
							:src="assetUrl(albumId!, form.coverId, 'thumb')"
							:srcset="srcsetFor(albumId!, form.coverId, 'thumb')"
							alt=""
							class="size-full object-cover"
						/>
						<UIcon v-else name="lucide:wand-sparkles" class="size-6 text-dimmed" />
						<span class="absolute bottom-1 end-1 size-6 rounded-full bg-default/90 flex items-center justify-center shadow">
							<UIcon name="lucide:pencil" class="size-3.5" />
						</span>
					</button>
					<UFormField :label="t('dialogs.fields.title')" required class="flex-1 min-w-0">
						<UInput v-model="form.title" class="w-full" maxlength="300" />
					</UFormField>
				</div>
				<!-- Scrolls in an outer box: a grid that scrolls itself squashes its rows (tiles clip their overflow). -->
				<div v-if="coverOpen" class="max-h-72 overflow-y-auto overscroll-contain -mx-1 px-1">
					<p v-if="photos.isPending.value" class="py-4 text-sm text-muted">{{ t("app.loading") }}</p>
					<div v-else class="grid grid-cols-4 sm:grid-cols-6 gap-1.5 py-1" role="listbox" :aria-label="t('dialogs.fields.cover')">
						<button
							type="button"
							role="option"
							:aria-selected="form.coverId === null"
							class="relative aspect-square rounded-lg bg-elevated flex flex-col items-center justify-center gap-1 text-xs text-muted outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
							:class="form.coverId === null ? 'outline-2 outline-primary' : ''"
							@click="pickCover(null)"
						>
							<UIcon name="lucide:wand-sparkles" class="size-5" />
							{{ t("dialogs.album_edit.cover_auto") }}
						</button>
						<button
							v-for="(pid, i) in photos.data.value?.ids.slice(0, 300) ?? []"
							:key="pid"
							type="button"
							role="option"
							:aria-selected="form.coverId === pid"
							:aria-label="photos.data.value?.titles[i] ?? pid"
							class="relative aspect-square rounded-lg overflow-hidden outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
							:class="form.coverId === pid ? 'outline-2 outline-primary' : ''"
							:style="{ backgroundColor: photos.data.value?.colours[i] ?? undefined }"
							@click="pickCover(pid)"
						>
							<img
								:src="assetUrl(albumId!, pid, 'thumb')"
								:srcset="srcsetFor(albumId!, pid, 'thumb')"
								alt=""
								loading="lazy"
								decoding="async"
								class="size-full object-cover"
							/>
						</button>
					</div>
				</div>
				<UFormField :label="t('dialogs.fields.description')">
					<UTextarea v-model="form.description" class="w-full" :rows="2" autoresize />
				</UFormField>
				<UFormField :label="t('dialogs.fields.layout')">
					<USelect v-model="form.layout" :items="layoutItems" class="w-full" />
				</UFormField>
				<template v-if="isTag">
					<UFormField :label="t('dialogs.fields.tags')">
						<TagInput v-model="form.tags" />
					</UFormField>
					<UFormField :label="t('dialogs.fields.tag_logic')">
						<USelect v-model="form.tagLogic" :items="logicItems" class="w-full" />
					</UFormField>
				</template>

				<UCollapsible v-model:open="moreOpen" :unmount-on-hide="false">
					<UButton
						color="neutral"
						variant="link"
						class="p-0"
						:trailing-icon="moreOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'"
					>
						{{ t("dialogs.album_edit.more") }}
					</UButton>
					<template #content>
						<div class="grid sm:grid-cols-2 gap-4 pt-4">
							<UFormField :label="t('dialogs.fields.photo_sorting')">
								<USelect v-model="form.photoSort" :items="photoSortItems" class="w-full" />
							</UFormField>
							<UFormField v-if="!isTag" :label="t('dialogs.fields.album_sorting')">
								<USelect v-model="form.albumSort" :items="albumSortItems" class="w-full" />
							</UFormField>
							<UFormField :label="t('dialogs.fields.license')">
								<USelect v-model="form.license" :items="licenseItems" class="w-full" />
							</UFormField>
							<UFormField v-if="!isTag" :label="t('dialogs.fields.slug')" :error="slugError" :help="t('dialogs.album_edit.slug_hint')" class="sm:col-span-2">
								<UInput v-model="form.slug" class="w-full" placeholder="my-album" />
							</UFormField>
							<USwitch
								v-if="head.protection"
								v-model="form.isNsfw"
								class="sm:col-span-2"
								:label="t('dialogs.fields.nsfw')"
								:description="t('dialogs.protection.nsfw_hint')"
							/>
						</div>
					</template>
				</UCollapsible>
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
			/>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import type { AlbumHead } from "@longan/shared";
import { useQuery } from "@tanstack/vue-query";
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { assetUrl, srcsetFor } from "@/api/assets.ts";
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
import DialogActions from "./DialogActions.vue";
import TagInput from "./TagInput.vue";
import { useApiAction, useDialog } from "./useDialog.ts";

type Patch = Parameters<typeof client.albums.update>[0]["patch"];
const SLUG_RE = /^[a-z0-9-]{1,100}$/;

const { t } = useI18n();
const coverOpen = ref(false);
const moreOpen = ref(false);
const form = reactive({
	title: "",
	description: "",
	slug: "",
	license: DEFAULT_OPTION as string,
	/** "col:order", or DEFAULT_OPTION. */
	photoSort: DEFAULT_OPTION as string,
	albumSort: DEFAULT_OPTION as string,
	isNsfw: false,
	layout: DEFAULT_OPTION as string,
	coverId: null as string | null,
	tags: [] as string[],
	tagLogic: "or" as "or" | "and",
});
const { open, ctx, close } = useDialog("albumEdit", () => {
	coverOpen.value = false;
	moreOpen.value = false;
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
			photoSort: sortValue(h.photoSorting),
			albumSort: sortValue(h.albumSorting),
			isNsfw: h.isNsfw,
			layout: h.photoLayout ?? DEFAULT_OPTION,
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
/** How each column reads in each direction ("Date taken, newest first" instead of a column + "Descending"). */
const ORDER_WORDS: Record<string, { asc: string; desc: string }> = {
	created_at: { asc: "oldest", desc: "newest" },
	taken_at: { asc: "oldest", desc: "newest" },
	min_taken_at: { asc: "oldest", desc: "newest" },
	max_taken_at: { asc: "oldest", desc: "newest" },
	title: { asc: "az", desc: "za" },
	type: { asc: "az", desc: "za" },
	rating_avg: { asc: "lowest", desc: "highest" },
};
function sortValue(s: { col: string; order: "asc" | "desc" } | null | undefined) {
	return s ? `${s.col}:${s.order}` : DEFAULT_OPTION;
}
function parseSort(v: string) {
	if (v === DEFAULT_OPTION) return null;
	const [col, order] = v.split(":") as [string, "asc" | "desc"];
	return { col, order };
}
function sortItems(prefix: string, cols: readonly string[]) {
	return [
		{ label: t("dialogs.default"), value: DEFAULT_OPTION },
		...cols.flatMap((col) =>
			(["desc", "asc"] as const).map((order) => ({
				label:
					col === "is_highlighted"
						? t(`sorting.highlighted_${order}`)
						: `${t(`${prefix}.${col}`)}, ${t(`sorting.order.${ORDER_WORDS[col]?.[order] ?? order}`)}`,
				value: `${col}:${order}`,
			})),
		),
	];
}
const photoSortItems = computed(() => sortItems("sorting.photo", PHOTO_SORT_COLS));
const albumSortItems = computed(() => sortItems("sorting.album", ALBUM_SORT_COLS));
const layoutItems = computed(() => withDefault("gallery.layout", PHOTO_LAYOUTS));
const licenseItems = computed(() => [
	{ label: t("dialogs.default"), value: DEFAULT_OPTION },
	...LICENSES.map((l) => ({ label: t(licenseKey(l)), value: l })),
]);
const logicItems = computed(() => [
	{ label: t("dialogs.tag_logic.or"), value: "or" },
	{ label: t("dialogs.tag_logic.and"), value: "and" },
]);
const slugError = computed(() =>
	form.slug && !SLUG_RE.test(form.slug) ? t("dialogs.album_edit.slug_invalid") : undefined,
);

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
	const ps = parseSort(form.photoSort);
	if (JSON.stringify(ps) !== JSON.stringify(h.photoSorting ?? null))
		patch.photoSorting = ps as Patch["photoSorting"];
	if (!isTag.value) {
		const as = parseSort(form.albumSort);
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
		// The sensitive flag travels with the visibility settings on the server (owner/admin only).
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

/** Picking closes the grid again; the thumbnail next to the title shows the choice. */
function pickCover(id: string | null) {
	form.coverId = id;
	coverOpen.value = false;
}

function submit() {
	const h = head.value;
	if (!h || slugError.value || !form.title.trim()) return;
	save.mutate({ head: h, patch: buildPatch(h), isNsfw: form.isNsfw });
}
</script>
