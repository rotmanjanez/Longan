import { useI18n } from "vue-i18n";
import { client } from "@/api/client.ts";
import { useApiAction } from "@/components/dialogs/useDialog.ts";

/** Single-photo mutations used by the lightbox and the details panel. */
export function usePhotoActions() {
	const { t } = useI18n();
	const highlight = useApiAction(
		(v: { id: string; value: boolean }) => client.photos.highlight({ ids: [v.id], value: v.value }),
		{
			invalidate: (v) => ({ photos: [v.id] }),
			success: (v) => t(v.value ? "lightbox.toast.highlighted" : "lightbox.toast.unhighlighted"),
		},
	);
	const rate = useApiAction((v: { id: string; rating: number }) => client.photos.rate(v), {
		invalidate: (v) => ({ photos: [v.id] }),
	});
	// Rotation bumps photos.updated_at; refetched details/listings carry the new asset version (?v=).
	const rotate = useApiAction((v: { id: string; direction: "cw" | "ccw" }) => client.photos.rotate(v), {
		invalidate: (v) => ({ photos: [v.id] }),
		success: () => t("lightbox.toast.rotated"),
	});
	return { highlight, rate, rotate };
}
