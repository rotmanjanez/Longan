/** Action names emitted by SelectionToolbar (`action` event). Dialog-backed ones map to ui store dialog flags. */
export const SELECTION_ACTIONS = ["highlight", "tag", "copy", "move", "rename", "merge", "delete"] as const;
export type SelectionAction = (typeof SELECTION_ACTIONS)[number];

export type SelectionRights = {
	canEdit: boolean;
	canMove: boolean;
	canDelete: boolean;
	canDownload: boolean;
};

/** Dialog flag (ui store) opened by an action; `highlight` runs directly without a dialog. */
export function actionDialog(name: SelectionAction): Exclude<SelectionAction, "highlight"> | null {
	return name === "highlight" ? null : name;
}

/** Album-level actions in the album heading; each maps to the ui store dialog of the same name. */
export type AlbumAction = "upload" | "createAlbum" | "albumEdit" | "share";
