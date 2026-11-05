import { useToast } from "@nuxt/ui/composables";
import { useMutation } from "@tanstack/vue-query";
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { orpc, queryClient } from "@/api/query.ts";
import { invalidatePhotoDetails } from "@/composables/usePhotoDetails.ts";
import { type DialogName, useUiStore } from "@/stores/ui.ts";

/**
 * Open flag + context of one ui-store dialog. `onOpen` runs every time the dialog opens (forms reset there).
 */
export function useDialog(name: DialogName, onOpen?: () => void) {
	const ui = useUiStore();
	const open = computed({
		get: () => ui.dialogs[name],
		set: (v: boolean) => {
			if (v) ui.dialogs[name] = true;
			else ui.closeDialog(name);
		},
	});
	const ctx = computed(() => ui.dialogContext);
	if (onOpen) watch(open, (v) => v && onOpen(), { immediate: true });
	return { open, ctx, close: () => ui.closeDialog(name) };
}

export type InvalidateScope = {
	albums?: boolean;
	/** true = every photo query; ids additionally drop those photos' cached details. */
	photos?: boolean | readonly string[];
	tags?: boolean;
	sharing?: boolean;
	init?: boolean;
};

/** Refetch the server data touched by a mutation (query cache + the shared photo details loader). */
export async function invalidateGallery(scope: InvalidateScope): Promise<void> {
	const jobs: Promise<unknown>[] = [];
	if (scope.photos) {
		invalidatePhotoDetails(Array.isArray(scope.photos) ? scope.photos : undefined);
		jobs.push(queryClient.invalidateQueries({ queryKey: orpc.photos.key() }));
		jobs.push(queryClient.invalidateQueries({ queryKey: orpc.search.key() }));
		jobs.push(queryClient.invalidateQueries({ queryKey: orpc.map.key() }));
	}
	if (scope.albums || scope.photos) jobs.push(queryClient.invalidateQueries({ queryKey: orpc.albums.key() }));
	if (scope.tags) jobs.push(queryClient.invalidateQueries({ queryKey: orpc.tags.key() }));
	if (scope.sharing) jobs.push(queryClient.invalidateQueries({ queryKey: orpc.sharing.key() }));
	if (scope.init) jobs.push(queryClient.invalidateQueries({ queryKey: orpc.init.key() }));
	await Promise.all(jobs);
}

/**
 * A mutation with the app's conventions: errors go through the shared error mapper (MutationCache), success
 * shows a toast, invalidates the given scope and runs `after`.
 */
export function useApiAction<V, R = unknown>(
	fn: (vars: V) => Promise<R>,
	opts: {
		success?: (vars: V, result: R) => string | null;
		/** Repeats of the action (toggles, rotations) update one toast in place instead of stacking new ones. */
		toastId?: string;
		invalidate?: (vars: V, result: R) => InvalidateScope;
		after?: (vars: V, result: R) => void | Promise<void>;
	} = {},
) {
	const toast = useToast();
	return useMutation({
		mutationFn: fn,
		onSuccess: async (result, vars) => {
			if (opts.invalidate) await invalidateGallery(opts.invalidate(vars, result));
			const title = opts.success?.(vars, result);
			if (title)
				toast.add({
					...(opts.toastId && { id: opts.toastId }),
					title,
					color: "success",
					icon: "lucide:circle-check",
				});
			await opts.after?.(vars, result);
		},
	});
}

/** Album context for asset urls / photo details of the current page (album id, or "timeline" elsewhere). */
export function useAlbumCtx() {
	const route = useRoute();
	return computed(() => {
		const id = route.params.albumId;
		return route.name === "album" && typeof id === "string" && id ? id : "timeline";
	});
}
