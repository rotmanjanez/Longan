import { ORPCError } from "@orpc/client";

/** Wiring provided by the app shell at startup (keeps this module free of router/store imports). */
export type ErrorHandlerDeps = {
	toast: (t: { id?: string; title: string; description?: string; color?: "error" | "warning" }) => void;
	/** Current route full path, used as the post-login redirect target. */
	currentPath: () => string;
	/** Album id the current view is showing, if any (fallback target for PASSWORD_REQUIRED). */
	currentAlbumId: () => string | null;
	openUnlock: (albumId: string) => void;
	translate: (key: string, fallback: string) => string;
	navigate?: (url: string) => void;
};

let deps: ErrorHandlerDeps | null = null;

export function configureErrorHandling(d: ErrorHandlerDeps): void {
	deps = d;
}

export function errorCode(error: unknown): string | null {
	return error instanceof ORPCError ? String(error.code) : null;
}

/** 4xx-ish errors (and the custom PASSWORD_REQUIRED) that should not be retried. */
export function isClientError(error: unknown): boolean {
	return error instanceof ORPCError && error.status >= 400 && error.status < 500;
}

export function loginUrl(redirect: string): string {
	return `/auth/login?redirect=${encodeURIComponent(redirect)}`;
}

/** Album id carried by a PASSWORD_REQUIRED error (`data.albumId` / `data.id`), when the server provides it. */
function albumIdFromError(error: ORPCError<string, unknown>): string | null {
	const data = error.data as { albumId?: unknown; id?: unknown } | undefined;
	if (data && typeof data.albumId === "string") return data.albumId;
	if (data && typeof data.id === "string") return data.id;
	return null;
}

/**
 * Central mapping of API errors to UI behaviour:
 * - UNAUTHORIZED: redirect to the OIDC login with the current path as redirect target.
 * - PASSWORD_REQUIRED: open the album unlock dialog.
 * - anything else: an error toast (deduplicated by code + message).
 */
export function handleApiError(error: unknown): void {
	if (!deps) return;
	if (error instanceof ORPCError) {
		const code = String(error.code);
		if (code === "UNAUTHORIZED") {
			(deps.navigate ?? ((u) => window.location.assign(u)))(loginUrl(deps.currentPath()));
			return;
		}
		if (code === "PASSWORD_REQUIRED") {
			const albumId = albumIdFromError(error) ?? deps.currentAlbumId();
			if (albumId) {
				deps.openUnlock(albumId);
				return;
			}
		}
		deps.toast({
			id: `api-${code}-${error.message}`,
			title: deps.translate(`errors.codes.${code}`, code),
			description: error.message,
			color: "error",
		});
		return;
	}
	const message = error instanceof Error ? error.message : String(error);
	deps.toast({
		id: `api-network-${message}`,
		title: deps.translate("errors.network", "Network error"),
		description: message,
		color: "error",
	});
}
