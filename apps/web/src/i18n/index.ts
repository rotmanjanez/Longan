import { createI18n } from "vue-i18n";
import en from "./en.json";

export type MessageSchema = typeof en;

export const i18n = createI18n<[MessageSchema], "en">({
	legacy: false,
	locale: "en",
	fallbackLocale: "en",
	messages: { en },
	datetimeFormats: {
		en: {
			short: { year: "numeric", month: "short", day: "numeric" },
			month: { year: "numeric", month: "short" },
			long: { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" },
		},
	},
	missingWarn: false,
	fallbackWarn: false,
});

/** Translate with a fallback when the key does not exist (used for server-provided codes). */
export function tOr(key: string, fallback: string): string {
	const t = i18n.global.t as (k: string) => string;
	return i18n.global.te(key) ? t(key) : fallback;
}
