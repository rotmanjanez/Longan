import { env } from "../env.ts";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const threshold = LEVELS[env.LOG_LEVEL];

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
	if (LEVELS[level] < threshold) return;
	const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${data ? ` ${JSON.stringify(data)}` : ""}`;
	if (level === "error") console.error(line);
	else console.log(line);
}

export const log = {
	debug: (m: string, d?: Record<string, unknown>) => emit("debug", m, d),
	info: (m: string, d?: Record<string, unknown>) => emit("info", m, d),
	warn: (m: string, d?: Record<string, unknown>) => emit("warn", m, d),
	error: (m: string, d?: Record<string, unknown>) => emit("error", m, d),
};
