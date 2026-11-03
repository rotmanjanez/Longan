import type { ShareGrants } from "@longan/shared";

export const GRANT_KEYS = [
	"grantsFullPhotoAccess",
	"grantsDownload",
	"grantsUpload",
	"grantsEdit",
	"grantsMove",
	"grantsDelete",
] as const satisfies readonly (keyof ShareGrants)[];

/**
 * What people can do in a shared album, as three presets instead of six independent flags. Rows written with
 * other combinations (older shares, the API) show as "custom" and are left alone until a preset is picked.
 */
export const ROLES = {
	view: {
		grantsFullPhotoAccess: true,
		grantsDownload: true,
		grantsUpload: false,
		grantsEdit: false,
		grantsMove: false,
		grantsDelete: false,
	},
	contribute: {
		grantsFullPhotoAccess: true,
		grantsDownload: true,
		grantsUpload: true,
		grantsEdit: false,
		grantsMove: false,
		grantsDelete: false,
	},
	edit: {
		grantsFullPhotoAccess: true,
		grantsDownload: true,
		grantsUpload: true,
		grantsEdit: true,
		grantsMove: true,
		grantsDelete: true,
	},
} as const satisfies Record<string, ShareGrants>;
export type Role = keyof typeof ROLES;
export const ROLE_KEYS = Object.keys(ROLES) as Role[];
export const ROLE_ICONS: Record<Role | "custom", string> = {
	view: "lucide:eye",
	contribute: "lucide:image-plus",
	edit: "lucide:pencil",
	custom: "lucide:sliders-horizontal",
};

export const DEFAULT_GRANTS: ShareGrants = { ...ROLES.view };

export function roleOf(g: ShareGrants): Role | "custom" {
	return ROLE_KEYS.find((r) => GRANT_KEYS.every((k) => ROLES[r][k] === g[k])) ?? "custom";
}

export function pickGrants(g: ShareGrants): ShareGrants {
	return Object.fromEntries(GRANT_KEYS.map((k) => [k, g[k]])) as ShareGrants;
}
