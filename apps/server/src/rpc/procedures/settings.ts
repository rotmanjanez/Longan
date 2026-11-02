import { notImplemented, os } from "../base.ts";

export const settings = os.settings.router({
	list: os.settings.list.handler(notImplemented("settings.list")),
	update: os.settings.update.handler(notImplemented("settings.update")),
});
