import { client } from "@/api/client.ts";
import { orpc, queryClient } from "@/api/query.ts";
import { invalidateGallery, useApiAction } from "@/components/dialogs/useDialog.ts";

export type SettingEntry = { key: string; value: string | null };

/**
 * `settings.update` + refetch of the settings list and `init.get` (config, theme, feature flags), so the
 * whole app reflects the change right away. Errors go through the shared mapper.
 */
export function useSaveSettings(success: () => string, after?: (entries: SettingEntry[]) => void) {
	return useApiAction((entries: SettingEntry[]) => client.settings.update({ entries }), {
		success: () => success(),
		after: async (entries) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.settings.key() }),
				invalidateGallery({ init: true }),
			]);
			after?.(entries);
		},
	});
}
