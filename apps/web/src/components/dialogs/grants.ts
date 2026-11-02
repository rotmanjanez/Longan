import type { ShareGrants } from "@longan/shared";

export const GRANT_KEYS = [
	"grantsFullPhotoAccess",
	"grantsDownload",
	"grantsUpload",
	"grantsEdit",
	"grantsMove",
	"grantsDelete",
] as const satisfies readonly (keyof ShareGrants)[];

export const GRANT_ICONS: Record<keyof ShareGrants, string> = {
	grantsFullPhotoAccess: "lucide:maximize-2",
	grantsDownload: "lucide:download",
	grantsUpload: "lucide:upload",
	grantsEdit: "lucide:pencil",
	grantsMove: "lucide:folder-input",
	grantsDelete: "lucide:trash-2",
};

export const DEFAULT_GRANTS: ShareGrants = {
	grantsFullPhotoAccess: true,
	grantsDownload: true,
	grantsUpload: false,
	grantsEdit: false,
	grantsMove: false,
	grantsDelete: false,
};

export function pickGrants(g: ShareGrants): ShareGrants {
	return Object.fromEntries(GRANT_KEYS.map((k) => [k, g[k]])) as ShareGrants;
}
