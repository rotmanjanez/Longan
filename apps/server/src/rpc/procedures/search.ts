import { notImplemented, os } from "../base.ts";

export const search = os.search.router({
	photos: os.search.photos.handler(notImplemented("search.photos")),
	albums: os.search.albums.handler(notImplemented("search.albums")),
});
