import { notImplemented, os } from "../base.ts";

export const users = os.users.router({
	search: os.users.search.handler(notImplemented("users.search")),
	list: os.users.list.handler(notImplemented("users.list")),
});
