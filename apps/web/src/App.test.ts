import ui from "@nuxt/ui/vue-plugin";
import { ORPCError } from "@orpc/client";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initData, installResizeObserver, ratios, rootAlbums } from "@/test/fixtures.ts";

const api = vi.hoisted(() => ({
	init: { get: vi.fn() },
	albums: { root: vi.fn(), head: vi.fn(), children: vi.fn(), unlock: vi.fn() },
	photos: { ratios: vi.fn(), buckets: vi.fn(), details: vi.fn(async () => []) },
}));
vi.mock("@/api/client.ts", async () => ({ client: (await import("@/test/fixtures.ts")).autoMock(api) }));

const { queryClient } = await import("@/api/query.ts");
const { router } = await import("@/router/index.ts");
const { i18n } = await import("@/i18n/index.ts");
const { pinia } = await import("@/stores/index.ts");
const App = (await import("@/App.vue")).default;

async function mountAt(path: string) {
	await router.push(path).catch(() => {});
	const wrapper = mount(App, {
		attachTo: document.body,
		global: { plugins: [pinia, router, i18n, ui, [VueQueryPlugin, { queryClient }]] },
	});
	await router.isReady();
	for (let i = 0; i < 5; i++) {
		await flushPromises();
		await new Promise((r) => setTimeout(r, 0));
	}
	return wrapper;
}

beforeAll(() => {
	installResizeObserver(1000);
	window.matchMedia ??= ((q: string) => ({
		matches: false,
		media: q,
		addEventListener() {},
		removeEventListener() {},
	})) as never;
	window.scrollTo = (() => {}) as never;
});

afterEach(() => {
	queryClient.clear();
	vi.clearAllMocks();
	document.body.innerHTML = "";
});

describe("app shell", () => {
	it("shows a readable error when init fails (server not implemented yet)", async () => {
		api.init.get.mockRejectedValue(
			new ORPCError("NOT_IMPLEMENTED", { message: "init.get is not implemented" }),
		);
		const w = await mountAt("/");
		// init retries once on server errors (default ~1s back-off) before the error surfaces.
		await vi.waitFor(() => expect(w.text()).toContain("The gallery could not be loaded"), { timeout: 4000 });
		expect(w.text()).toContain("NOT_IMPLEMENTED: init.get is not implemented");
		expect(w.find("button").text()).toContain("Retry");
		w.unmount();
	});

	it("renders the root albums with title, badges and the NSFW blur", async () => {
		api.init.get.mockResolvedValue(initData);
		api.albums.root.mockResolvedValue(rootAlbums);
		const w = await mountAt("/");
		const text = w.text();
		expect(text).toContain("Test Gallery");
		expect(text).toContain("Smart albums");
		expect(text).toContain("Recent");
		expect(text).toContain("Holiday 2024");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.style.getPropertyValue("--ui-color-primary-500")).not.toBe("");
		const holiday = w.find(`a[data-album-id="${rootAlbums.albums[0]!.id}"]`);
		expect(holiday.attributes("href")).toBe(`/gallery/${rootAlbums.albums[0]!.id}`);
		expect(holiday.find("img[srcset]").attributes("srcset")).toContain("/thumb2x 2x");
		expect(holiday.find('[aria-label="Public"]').exists()).toBe(true);
		expect(
			w.find(`a[data-album-id="${rootAlbums.albums[1]!.id}"] [aria-label="Password protected"]`).exists(),
		).toBe(true);
		const spicy = w.find(`a[data-album-id="${rootAlbums.albums[2]!.id}"]`);
		expect(spicy.find("img.blur-xl").exists()).toBe(true);
		w.unmount();
	});

	it("renders an album with header, bucket headers and virtualized photo tiles", async () => {
		const albumId = rootAlbums.albums[0]!.id;
		api.init.get.mockResolvedValue(initData);
		api.albums.head.mockResolvedValue({
			id: albumId,
			kind: "album",
			title: "Holiday 2024",
			description: "Line one\nLine two",
			ownerId: 1,
			ownerName: "Alice",
			parentId: null,
			breadcrumbs: [],
			coverId: null,
			isNsfw: false,
			license: null,
			slug: null,
			createdAt: null,
			publishedAt: null,
			numPhotos: 6,
			numChildren: 0,
			minTakenAt: null,
			maxTakenAt: null,
			photoSorting: null,
			albumSorting: null,
			photoLayout: "square",
			protection: null,
			tags: [],
			tagLogic: null,
			rights: {
				canEdit: true,
				canDelete: true,
				canMove: true,
				canUpload: true,
				canDownload: true,
				canShare: true,
				canAccessFullPhoto: true,
			},
		});
		const listing = ratios(6, ["2024-08", "2024-07"]);
		api.photos.ratios.mockResolvedValue(listing);
		api.photos.buckets.mockResolvedValue({
			ids: ["2024-08", "2024-07"],
			counts: [3, 3],
			labels: ["August 2024", "July 2024"],
		});
		const w = await mountAt(`/gallery/${albumId}`);
		const text = w.text();
		expect(text).toContain("Holiday 2024");
		expect(text).toContain("6 photos");
		expect(w.find("p.whitespace-pre-line").text()).toBe("Line one\nLine two");
		expect(text).toContain("August 2024");
		expect(text).toContain("July 2024");
		const tiles = w.findAll("a[data-photo-tile]");
		expect(tiles.length).toBe(6);
		expect(tiles[0]!.find("img").attributes("srcset")).toContain(`/api/asset/${albumId}/`);
		expect(tiles[0]!.find('[aria-label="Highlighted"]').exists()).toBe(true);
		expect(tiles[0]!.attributes("style")).toContain("background-color");

		// ctrl-click selects and shows the toolbar; a plain click opens the photo route.
		await tiles[2]!.trigger("click", { ctrlKey: true, button: 0 });
		expect(w.find('[role="toolbar"]').text()).toContain("1 photo selected");
		await tiles[3]!.trigger("click", { button: 0 });
		await flushPromises();
		await new Promise((r) => setTimeout(r, 0));
		expect(router.currentRoute.value.params.photoId).toBe(listing.ids[3]);
		expect(
			document.body.querySelector('[role="dialog"][aria-modal="true"] img')?.getAttribute("src"),
		).toContain("/medium");
		w.unmount();
	});
});
