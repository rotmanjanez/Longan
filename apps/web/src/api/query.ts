import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/vue-query";
import { client } from "./client.ts";
import { handleApiError, isClientError } from "./errors.ts";

declare module "@tanstack/vue-query" {
	interface Register {
		queryMeta: { silentError?: boolean };
		mutationMeta: { silentError?: boolean };
	}
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (!query.meta?.silentError) handleApiError(error);
		},
	}),
	mutationCache: new MutationCache({
		onError: (error, _vars, _ctx, mutation) => {
			if (!mutation.meta?.silentError) handleApiError(error);
		},
	}),
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			refetchOnWindowFocus: false,
			// 4xx-class errors (auth, not found, password) never get better by retrying.
			retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
		},
	},
});

/** `orpc.albums.head.queryOptions({ input })`, `orpc.photos.update.mutationOptions()`, `orpc.photos.key()` etc. */
export const orpc = createTanstackQueryUtils(client);
