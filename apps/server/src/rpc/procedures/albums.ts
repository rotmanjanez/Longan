import { notImplemented, os } from "../base.ts";

export const albums = os.albums.router({
	root: os.albums.root.handler(notImplemented("albums.root")),
	head: os.albums.head.handler(notImplemented("albums.head")),
	children: os.albums.children.handler(notImplemented("albums.children")),
	tree: os.albums.tree.handler(notImplemented("albums.tree")),
	create: os.albums.create.handler(notImplemented("albums.create")),
	update: os.albums.update.handler(notImplemented("albums.update")),
	move: os.albums.move.handler(notImplemented("albums.move")),
	merge: os.albums.merge.handler(notImplemented("albums.merge")),
	delete: os.albums.delete.handler(notImplemented("albums.delete")),
	setProtection: os.albums.setProtection.handler(notImplemented("albums.setProtection")),
	unlock: os.albums.unlock.handler(notImplemented("albums.unlock")),
});
