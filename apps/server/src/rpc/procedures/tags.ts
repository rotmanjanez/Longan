import { notImplemented, os } from "../base.ts";

export const tags = os.tags.router({
	list: os.tags.list.handler(notImplemented("tags.list")),
	rename: os.tags.rename.handler(notImplemented("tags.rename")),
	merge: os.tags.merge.handler(notImplemented("tags.merge")),
	delete: os.tags.delete.handler(notImplemented("tags.delete")),
	attach: os.tags.attach.handler(notImplemented("tags.attach")),
	detach: os.tags.detach.handler(notImplemented("tags.detach")),
});
