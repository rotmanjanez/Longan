import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import type { InitData } from "@/api/client.ts";
import { loginUrl } from "@/api/errors.ts";
import { queryClient } from "@/api/query.ts";
import { initQueryOptions } from "@/composables/useInit.ts";

declare module "vue-router" {
	interface RouteMeta {
		/** Requires `rights.isAdmin`. */
		admin?: boolean;
		/** Requires a logged-in user. */
		auth?: boolean;
		/** i18n key of the page title. */
		title?: string;
	}
}

const ComingSoon = () => import("@/views/ComingSoon.vue");

const routes: RouteRecordRaw[] = [
	{
		path: "/",
		name: "root",
		component: () => import("@/views/RootAlbums.vue"),
		meta: { title: "nav.gallery" },
	},
	{
		path: "/gallery/:albumId/:photoId?",
		name: "album",
		component: () => import("@/views/AlbumView.vue"),
	},
	{
		path: "/search",
		name: "search",
		component: () => import("@/views/SearchView.vue"),
		meta: { title: "nav.search" },
	},
	{
		path: "/map/:albumId?",
		name: "map",
		component: () => import("@/views/MapView.vue"),
		meta: { title: "nav.map" },
	},
	{
		path: "/timeline/:photoId?",
		name: "timeline",
		component: () => import("@/views/TimelineView.vue"),
		meta: { title: "nav.timeline" },
	},
	{
		path: "/tags",
		name: "tags",
		component: () => import("@/views/TagsView.vue"),
		meta: { title: "nav.tags" },
	},
	{
		path: "/login",
		name: "login",
		component: () => import("@/views/LoginView.vue"),
		meta: { title: "nav.login" },
	},

	// ---------------------------------------------------------------------------------------------------
	// SECOND WEB AGENT: sharing + admin views. Swap `ComingSoon` for the real lazy views, e.g.
	//   component: () => import("@/views/Sharing.vue")
	//   component: () => import("@/views/admin/Settings.vue")   (Users.vue, Health.vue, Jobs.vue)
	// Route names/paths/meta are final; keep them so the left menu links keep working.
	// ---------------------------------------------------------------------------------------------------
	{ path: "/sharing", name: "sharing", component: ComingSoon, meta: { auth: true, title: "nav.sharing" } },
	{ path: "/admin", redirect: "/admin/settings" },
	{
		path: "/admin/settings",
		name: "admin-settings",
		component: ComingSoon,
		meta: { admin: true, title: "nav.admin_settings" },
	},
	{
		path: "/admin/users",
		name: "admin-users",
		component: ComingSoon,
		meta: { admin: true, title: "nav.admin_users" },
	},
	{
		path: "/admin/health",
		name: "admin-health",
		component: ComingSoon,
		meta: { admin: true, title: "nav.admin_health" },
	},
	{
		path: "/admin/jobs",
		name: "admin-jobs",
		component: ComingSoon,
		meta: { admin: true, title: "nav.admin_jobs" },
	},
	// --- end of second-agent section -------------------------------------------------------------------

	{ path: "/:pathMatch(.*)*", name: "not-found", component: () => import("@/views/NotFound.vue") },
];

export const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes,
	scrollBehavior(to, from, saved) {
		if (saved) return saved;
		// Opening/closing/stepping the lightbox only changes the photo param: keep the grid where it is.
		if (to.name === from.name && to.params.albumId === from.params.albumId && to.query.q === from.query.q) {
			return false;
		}
		return { top: 0 };
	},
});

router.beforeEach(async (to) => {
	if (to.name === "login") return true;
	let init: InitData | undefined;
	try {
		init = await queryClient.ensureQueryData(initQueryOptions());
	} catch {
		return true; // the shell shows the init error
	}
	if (!init) return true;
	if (init.config.loginRequired && !init.user) {
		window.location.assign(loginUrl(to.fullPath));
		return false;
	}
	if ((to.meta.auth || to.meta.admin) && !init.user)
		return { name: "login", query: { redirect: to.fullPath } };
	if (to.meta.admin && !init.rights.isAdmin) return { name: "root" };
	return true;
});
