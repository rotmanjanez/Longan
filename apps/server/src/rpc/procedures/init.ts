import { notImplemented, os } from "../base.ts";

export const init = os.init.router({
	get: os.init.get.handler(notImplemented("init.get")),
});
