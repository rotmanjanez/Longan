import { notImplemented, os } from "../base.ts";

export const sharing = os.sharing.router({
	list: os.sharing.list.handler(notImplemented("sharing.list")),
	listAll: os.sharing.listAll.handler(notImplemented("sharing.listAll")),
	add: os.sharing.add.handler(notImplemented("sharing.add")),
	update: os.sharing.update.handler(notImplemented("sharing.update")),
	remove: os.sharing.remove.handler(notImplemented("sharing.remove")),
});
