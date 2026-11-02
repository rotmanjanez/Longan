import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import type { InitData } from "@/api/client.ts";
import { orpc } from "@/api/query.ts";

export function initQueryOptions() {
	return orpc.init.get.queryOptions({ meta: { silentError: true }, staleTime: 5 * 60_000, retry: 1 });
}

/**
 * Boot data (`init.get`): user, global rights, config. The app shell renders nothing but the loading
 * screen until this query has data, so below the shell the accessors are always defined.
 */
export function useInit() {
	const query = useQuery(initQueryOptions());
	const data = computed(() => query.data.value as InitData);
	return {
		query,
		data,
		config: computed(() => data.value.config),
		rights: computed(() => data.value.rights),
		user: computed(() => data.value.user),
		isLoggedIn: computed(() => data.value.user !== null),
	};
}
