import { type Db, db as defaultDb } from "../db/index.ts";
import { settings } from "../db/schema.ts";

/** In-process cache of the settings table. Call `invalidateSettings()` after writes. */
let cache: Map<string, string | null> | null = null;

export async function allSettings(db: Db = defaultDb): Promise<Map<string, string | null>> {
	if (cache) return cache;
	const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
	cache = new Map(rows.map((r) => [r.key, r.value]));
	return cache;
}

export function invalidateSettings() {
	cache = null;
}

export async function setting(key: string, db?: Db): Promise<string | null> {
	return (await allSettings(db)).get(key) ?? null;
}
export async function settingBool(key: string, fallback = false, db?: Db): Promise<boolean> {
	const v = await setting(key, db);
	return v === null ? fallback : v === "1" || v === "true";
}
export async function settingInt(key: string, fallback: number, db?: Db): Promise<number> {
	const v = await setting(key, db);
	const n = v === null ? Number.NaN : Number.parseInt(v, 10);
	return Number.isFinite(n) ? n : fallback;
}
export async function settingStr(key: string, fallback: string, db?: Db): Promise<string> {
	return (await setting(key, db)) ?? fallback;
}
export async function settingJson<T>(key: string, fallback: T, db?: Db): Promise<T> {
	const v = await setting(key, db);
	if (v === null) return fallback;
	try {
		return JSON.parse(v) as T;
	} catch {
		return fallback;
	}
}
