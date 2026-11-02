import type { PhotoLayout } from "@longan/shared";
import { defineStore } from "pinia";
import { computed, reactive, ref, watch } from "vue";

/**
 * Every dialog/drawer of the app is a flag here (Lychee's "togglables" pattern): views open them through
 * `openDialog(name, context)`, the dialog components read `dialogs[name]` + `dialogContext`.
 * Implemented by the second web agent (components/dialogs, components/photo, components/upload, ...).
 */
export const DIALOG_NAMES = [
	"upload",
	"createAlbum",
	"createTagAlbum",
	"albumEdit",
	"albumProtection",
	"share",
	"move",
	"copy",
	"merge",
	"rename",
	"delete",
	"tag",
	"photoEdit",
	"photoDetails",
	"keybindings",
] as const;
export type DialogName = (typeof DIALOG_NAMES)[number];

export type DialogContext = {
	/** Album the action is invoked from (null on the root view / smart albums for moves). */
	albumId: string | null;
	photoIds: string[];
	albumIds: string[];
};

const DARK_KEY = "longan-dark-mode";
const LAYOUT_KEY = "longan-layout";
const NSFW_KEY = "longan-nsfw-consent";

function readStorage(storage: Storage | undefined, key: string): string | null {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}
function writeStorage(storage: Storage | undefined, key: string, value: string | null) {
	try {
		if (value === null) storage?.removeItem(key);
		else storage?.setItem(key, value);
	} catch {
		/* private mode */
	}
}

const local = typeof window !== "undefined" ? window.localStorage : undefined;
const session = typeof window !== "undefined" ? window.sessionStorage : undefined;

export const useUiStore = defineStore("ui", () => {
	// Dark mode: server default from init config, user override persisted in localStorage.
	// Until init config arrives, follow the system preference (same rule as the pre-paint script in index.html).
	const darkDefault = ref(
		typeof window !== "undefined" && typeof window.matchMedia === "function"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
			: false,
	);
	const darkOverride = ref<"dark" | "light" | null>(
		(readStorage(local, DARK_KEY) as "dark" | "light" | null) ?? null,
	);
	const isDark = computed(() => (darkOverride.value ? darkOverride.value === "dark" : darkDefault.value));
	function toggleDark() {
		darkOverride.value = isDark.value ? "light" : "dark";
	}
	watch(darkOverride, (v) => writeStorage(local, DARK_KEY, v));

	// Photo layout chosen in the album header; null = album/server default.
	const layoutOverride = ref<PhotoLayout | null>(
		(readStorage(local, LAYOUT_KEY) as PhotoLayout | null) ?? null,
	);
	watch(layoutOverride, (v) => writeStorage(local, LAYOUT_KEY, v));

	const leftMenuOpen = ref(false);

	/** Title of the current page when it is data-driven (album title); falls back to the route title. */
	const pageTitle = ref<string | null>(null);

	const dialogs = reactive(
		Object.fromEntries(DIALOG_NAMES.map((n) => [n, false])) as Record<DialogName, boolean>,
	);
	const dialogContext = ref<DialogContext>({ albumId: null, photoIds: [], albumIds: [] });
	function openDialog(name: DialogName, ctx?: Partial<DialogContext>) {
		dialogContext.value = { albumId: null, photoIds: [], albumIds: [], ...ctx };
		dialogs[name] = true;
	}
	function closeDialog(name: DialogName) {
		dialogs[name] = false;
	}

	// Album password dialog (opened on PASSWORD_REQUIRED).
	const unlockAlbumId = ref<string | null>(null);
	function openUnlock(albumId: string) {
		unlockAlbumId.value = albumId;
	}
	function closeUnlock() {
		unlockAlbumId.value = null;
	}

	/** True while any modal surface is open: page shortcuts and rubber-band selection pause. */
	const anyDialogOpen = computed(
		() => unlockAlbumId.value !== null || leftMenuOpen.value || DIALOG_NAMES.some((n) => dialogs[n]),
	);

	// NSFW: session toggle (key `h`) and per-album consent for the sensitive-content warning.
	const nsfwVisible = ref<boolean | null>(null);
	const nsfwConsented = ref<string[]>(JSON.parse(readStorage(session, NSFW_KEY) ?? "[]") as string[]);
	watch(nsfwConsented, (v) => writeStorage(session, NSFW_KEY, JSON.stringify(v)), { deep: true });
	function consentNsfw(albumId: string) {
		if (!nsfwConsented.value.includes(albumId)) nsfwConsented.value.push(albumId);
	}
	function hasNsfwConsent(albumId: string) {
		return nsfwVisible.value === true || nsfwConsented.value.includes(albumId);
	}

	return {
		darkDefault,
		darkOverride,
		isDark,
		toggleDark,
		layoutOverride,
		leftMenuOpen,
		pageTitle,
		dialogs,
		dialogContext,
		openDialog,
		closeDialog,
		unlockAlbumId,
		openUnlock,
		closeUnlock,
		anyDialogOpen,
		nsfwVisible,
		nsfwConsented,
		consentNsfw,
		hasNsfwConsent,
	};
});
