/**
 * Tiny event bus between the dialogs and the lightbox: when photos leave the current listing (deleted or
 * moved out of the album), the open lightbox steps to a neighbour or closes.
 */
export type PhotosRemovedKind = "deleted" | "moved";
type Listener = (ids: readonly string[], kind: PhotosRemovedKind) => void;

const listeners = new Set<Listener>();

export function onPhotosRemoved(fn: Listener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function emitPhotosRemoved(ids: readonly string[], kind: PhotosRemovedKind): void {
	for (const fn of [...listeners]) fn(ids, kind);
}
