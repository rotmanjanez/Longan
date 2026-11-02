import { randomBytes } from "node:crypto";
import { copyFile, mkdir, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { env } from "../env.ts";

/**
 * Storage layout: STORAGE_PATH/<variant>/<xx>/<yy>/<28 hex>.<ext>. All variants of one photo share the
 * same 32-hex random stem (xx + yy + 28 hex). Paths stored in the database are relative to the root.
 */

let root = resolve(env.STORAGE_PATH);

export function storageRoot(): string {
	return root;
}

/** Override the storage root (tests, CLI). */
export function setStorageRoot(path: string) {
	root = resolve(path);
}

/** Absolute path for a stored relative path. Refuses paths that escape the storage root. */
export function absPath(rel: string): string {
	if (isAbsolute(rel)) throw new Error(`expected a relative storage path: ${rel}`);
	const abs = resolve(root, normalize(rel));
	if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`path escapes storage root: ${rel}`);
	return abs;
}

/** Relative path of an absolute path inside the storage root. */
export function relPath(abs: string): string {
	return relative(root, abs).split(sep).join("/");
}

/** 128-bit random stem, 32 lowercase hex chars. */
export function newStem(): string {
	return randomBytes(16).toString("hex");
}

/** "<variant>/<xx>/<yy>/<28hex>.<ext>" */
export function variantPath(variant: string, stem: string, ext: string): string {
	if (!/^[0-9a-f]{32}$/.test(stem)) throw new Error(`invalid stem: ${stem}`);
	return `${variant}/${stem.slice(0, 2)}/${stem.slice(2, 4)}/${stem.slice(4)}.${ext.replace(/^\./, "")}`;
}

/** Recover the stem from a stored variant path, or null if it does not follow the layout. */
export function stemFromPath(rel: string): string | null {
	const m = /^[^/]+\/([0-9a-f]{2})\/([0-9a-f]{2})\/([0-9a-f]{28})\.[A-Za-z0-9]+$/.exec(rel);
	return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

export function tmpDir(): string {
	return join(root, "tmp");
}

/** A fresh path inside the tmp dir (the file is not created). */
export async function tmpFile(suffix = ""): Promise<string> {
	await ensureDir(tmpDir());
	return join(tmpDir(), `${randomBytes(12).toString("hex")}${suffix}`);
}

export async function ensureDir(dir: string) {
	await mkdir(dir, { recursive: true });
}

/** Unlink and ignore "not found". Other errors are rethrown. */
export async function safeUnlink(abs: string) {
	try {
		await unlink(abs);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

/** Remove now-empty <xx>/<yy> directories above a deleted variant file. Never throws. */
export async function pruneEmptyDirs(abs: string) {
	let dir = dirname(abs);
	for (let i = 0; i < 2 && dir.startsWith(root + sep); i++) {
		try {
			await rmdir(dir);
		} catch {
			return;
		}
		dir = dirname(dir);
	}
}

/** Move a file (rename, falling back to copy + unlink across devices). */
export async function moveFile(from: string, to: string) {
	await ensureDir(dirname(to));
	try {
		await rename(from, to);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
		await copyFile(from, to);
		await safeUnlink(from);
	}
}

export async function copyInto(from: string, to: string) {
	await ensureDir(dirname(to));
	await copyFile(from, to);
}
