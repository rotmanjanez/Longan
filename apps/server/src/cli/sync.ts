import { readdir, stat, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { accessPermissions, albums } from "../db/schema.ts";
import { newId } from "../lib/ids.ts";
import { ImportError, importFile, MediaError } from "../media/pipeline.ts";
import { SUPPORTED_EXTENSIONS } from "../media/sniff.ts";
import { settingBool, settingStr } from "../settings/index.ts";
import { CliError, out, resolveOwner } from "./common.ts";

const SUPPORTED = new Set<string>(SUPPORTED_EXTENSIONS);

type Opts = { ownerId: number; deleteImported: boolean; dryRun: boolean };
const stats = { created: 0, duplicate: 0, skipped: 0, failed: 0, albums: 0 };

/** Find a child album by title (same owner and parent) or create it applying albums.default_protection. */
async function albumFor(title: string, parentId: string | null, ownerId: number): Promise<string> {
	const [existing] = await db
		.select({ id: albums.id })
		.from(albums)
		.where(
			and(
				eq(albums.ownerId, ownerId),
				eq(albums.kind, "album"),
				eq(albums.title, title),
				parentId ? eq(albums.parentId, parentId) : isNull(albums.parentId),
			),
		)
		.limit(1);
	if (existing) return existing.id;
	const id = newId();
	const protection = await settingStr("albums.default_protection", "private");
	const license = await settingStr("albums.default_license", "none");
	await db.transaction(async (tx) => {
		await tx.insert(albums).values({ id, ownerId, title, parentId, license });
		if (protection === "public" || protection === "public_hidden" || protection === "signed_in") {
			await tx.insert(accessPermissions).values({
				albumId: id,
				userId: null,
				isLinkRequired: protection === "public_hidden",
				requiresLogin: protection === "signed_in",
				grantsFullPhotoAccess: await settingBool("albums.public_grants_full_photo", true),
				grantsDownload: await settingBool("albums.public_grants_download", false),
			});
		} else if (protection === "inherit" && parentId) {
			await tx.execute(sql`
				insert into access_permissions (album_id, user_id, is_link_required, requires_login, password_hash,
					grants_full_photo_access, grants_download, grants_upload, grants_edit, grants_delete, grants_move)
				select ${id}, user_id, is_link_required, requires_login, password_hash, grants_full_photo_access,
					grants_download, grants_upload, grants_edit, grants_delete, grants_move
				from access_permissions where album_id = ${parentId}`);
		}
	});
	stats.albums++;
	return id;
}

async function walk(dir: string, albumId: string | null, label: string, o: Opts) {
	const entries = (await readdir(dir, { withFileTypes: true }))
		.filter((e) => !e.name.startsWith("."))
		.sort((a, b) => a.name.localeCompare(b.name));
	for (const e of entries) {
		if (!e.isFile()) continue;
		const path = join(dir, e.name);
		const ext = extname(e.name).slice(1).toLowerCase();
		if (!SUPPORTED.has(ext)) {
			stats.skipped++;
			out(`  skip     ${path} (unsupported extension)`);
			continue;
		}
		if (o.dryRun) {
			out(`  import   ${path} -> ${label}`);
			continue;
		}
		try {
			const { mtimeMs } = await stat(path);
			const res = await importFile({
				tmpPath: path,
				originalName: e.name,
				mtime: mtimeMs,
				albumId,
				ownerId: o.ownerId,
				copy: true,
			});
			stats[res.status]++;
			out(`  ${res.status.padEnd(8)} ${path} -> ${label} (${res.photoId})`);
			if (o.deleteImported && res.status !== "skipped") await unlink(path);
		} catch (err) {
			if (err instanceof MediaError) {
				stats.skipped++;
				out(`  skip     ${path} (${err.message})`);
			} else {
				stats.failed++;
				out(`  FAILED   ${path}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}
	for (const e of entries) {
		if (!e.isDirectory()) continue;
		const childLabel = `${label === "unsorted" ? "" : `${label}/`}${e.name}`;
		const child = o.dryRun ? null : await albumFor(e.name, albumId, o.ownerId);
		if (o.dryRun) out(`  album    ${childLabel}`);
		await walk(join(dir, e.name), child, childLabel, o);
	}
}

export async function sync(args: string[]): Promise<number> {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			album: { type: "string" },
			owner: { type: "string" },
			"delete-imported": { type: "boolean", default: false },
			"dry-run": { type: "boolean", default: false },
		},
	});
	const dirArg = positionals[0];
	if (!dirArg) throw new CliError("sync needs a directory: sync <dir> [--album <id>] [--owner <user>]");
	const dir = resolve(dirArg);
	const st = await stat(dir).catch(() => null);
	if (!st?.isDirectory()) throw new CliError(`not a directory: ${dir}`);

	let albumId: string | null = null;
	let label = "unsorted";
	let albumOwner: number | undefined;
	if (values.album) {
		const [a] = await db
			.select({ id: albums.id, kind: albums.kind, title: albums.title, ownerId: albums.ownerId })
			.from(albums)
			.where(eq(albums.id, values.album));
		if (a?.kind !== "album") throw new CliError(`album "${values.album}" not found (or is a tag album)`);
		albumId = a.id;
		label = a.title;
		albumOwner = a.ownerId;
	}
	const owner = await resolveOwner(
		db,
		values.owner ?? (albumOwner !== undefined ? String(albumOwner) : undefined),
	);
	out(`sync ${dir} -> ${label} as ${owner.username}${values["dry-run"] ? " (dry run)" : ""}`);
	try {
		await walk(dir, albumId, label, {
			ownerId: owner.id,
			deleteImported: values["delete-imported"] ?? false,
			dryRun: values["dry-run"] ?? false,
		});
	} catch (err) {
		if (err instanceof ImportError) throw new CliError(err.message);
		throw err;
	}
	out(
		`done: ${stats.created} created, ${stats.duplicate} duplicates, ${stats.skipped} skipped, ${stats.failed} failed, ${stats.albums} albums created`,
	);
	return stats.failed > 0 ? 2 : 0;
}
