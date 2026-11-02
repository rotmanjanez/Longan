import { notImplemented, os } from "../base.ts";

export const photos = os.photos.router({
	ratios: os.photos.ratios.handler(notImplemented("photos.ratios")),
	buckets: os.photos.buckets.handler(notImplemented("photos.buckets")),
	details: os.photos.details.handler(notImplemented("photos.details")),
	update: os.photos.update.handler(notImplemented("photos.update")),
	move: os.photos.move.handler(notImplemented("photos.move")),
	copy: os.photos.copy.handler(notImplemented("photos.copy")),
	delete: os.photos.delete.handler(notImplemented("photos.delete")),
	rotate: os.photos.rotate.handler(notImplemented("photos.rotate")),
	highlight: os.photos.highlight.handler(notImplemented("photos.highlight")),
	rate: os.photos.rate.handler(notImplemented("photos.rate")),
	albumsOf: os.photos.albumsOf.handler(notImplemented("photos.albumsOf")),
});
