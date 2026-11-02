/**
 * Flag palette for tile corner badges (Lychee DESIGN.md "One Role, One Hue"): the only place where
 * non-semantic hues are allowed. Classes are spelled out in full for Tailwind's scanner.
 */
export type BadgeRole = "nsfw" | "favorite" | "danger" | "success" | "link" | "neutral";

export const BADGE_BG: Record<BadgeRole, string> = {
	nsfw: "bg-fuchsia-500 dark:bg-fuchsia-400",
	favorite: "bg-warning-500 dark:bg-warning-400",
	danger: "bg-error-700 dark:bg-error-600",
	success: "bg-success-600 dark:bg-success-500",
	link: "bg-orange-400 dark:bg-orange-300",
	neutral: "bg-neutral-500 dark:bg-neutral-400",
};
