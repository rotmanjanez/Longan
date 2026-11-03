import type { PhotoDetail } from "@longan/shared";
import ui from "@nuxt/ui/vue-plugin";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initData, installResizeObserver, ratios, rootAlbums } from "@/test/fixtures.ts";

const api = vi.hoisted(() => ({
	init: { get: vi.fn() },
	albums: { root: vi.fn(), head: vi.fn(), children: vi.fn(), unlock: vi.fn() },
	photos: {
		ratios: vi.fn(),
		buckets: vi.fn(),
		details: vi.fn(),
		rate: vi.fn(async () => {}),
		highlight: vi.fn(async () => {}),
	},
	tags: { list: vi.fn(async () => []) },
}));
vi.mock("@/api/client.ts", async () => ({ client: (await import("@/test/fixtures.ts")).autoMock(api) }));

const { queryClient } = await import("@/api/query.ts");
const { router } = await import("@/router/index.ts");
const { i18n } = await import("@/i18n/index.ts");
const { pinia } = await import("@/stores/index.ts");
const App = (await import("@/App.vue")).default;

const albumId = rootAlbums.albums[0]!.id;
const listing = ratios(6, ["2024-08"]);

function detail(id: string, over: Partial<PhotoDetail> = {}): PhotoDetail {
	return {
		id,
		title: `Photo ${id.slice(0, 4)}`,
		description: "Sunset at the pier",
		type: "image",
		mime: "image/jpeg",
		filesize: 2_500_000,
		width: 4000,
		height: 3000,
		checksum: "abc",
		ownerId: 1,
		takenAt: "2024-08-01T18:30:00.000Z",
		takenAtTz: "+02:00",
		createdAt: "2024-08-02T10:00:00.000Z",
		updatedAt: "2024-08-02T10:00:00.000Z",
		make: "FUJIFILM",
		model: "X-T5",
		lens: "XF 23mm",
		iso: "200",
		aperture: "f/2.8",
		shutter: "1/250 s",
		focal: "23 mm",
		latitude: null,
		longitude: null,
		altitude: null,
		license: "CC-BY-4.0",
		isHighlighted: false,
		ratingAvg: 3.5,
		myRating: null,
		duration: null,
		fps: null,
		tags: [{ id: 1, name: "beach" }],
		colours: ["#336699"],
		placeholder: null,
		sizeVariants: [
			{ type: "original", width: 4000, height: 3000, filesize: 2_500_000 },
			{ type: "medium2x", width: 3840, height: 2880, filesize: 900_000 },
			{ type: "medium", width: 1920, height: 1440, filesize: 400_000 },
			{ type: "thumb", width: 200, height: 200, filesize: 9_000 },
		],
		albums: [{ id: albumId, title: "Holiday 2024" }],
		rights: { canEdit: true, canDelete: true, canMove: true, canDownload: true, canAccessFullPhoto: true },
		...over,
	} as PhotoDetail;
}

const head = {
	id: albumId,
	kind: "album",
	title: "Holiday 2024",
	description: null,
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
};

async function settle() {
	for (let i = 0; i < 5; i++) {
		await flushPromises();
		await new Promise((r) => setTimeout(r, 0));
	}
}

async function openPhoto(index: number) {
	api.init.get.mockResolvedValue(initData);
	api.albums.head.mockResolvedValue(head);
	api.albums.children.mockResolvedValue([]);
	api.photos.ratios.mockResolvedValue(listing);
	api.photos.buckets.mockResolvedValue({ ids: ["2024-08"], counts: [6], labels: ["August 2024"] });
	api.photos.details.mockImplementation(async ({ ids }: { ids: string[] }) => ids.map((id) => detail(id)));
	await router.push(`/gallery/${albumId}/${listing.ids[index]}`).catch(() => {});
	const w = mount(App, {
		attachTo: document.body,
		global: { plugins: [pinia, router, i18n, ui, [VueQueryPlugin, { queryClient }]] },
	});
	await router.isReady();
	await settle();
	const box = () => document.body.querySelector<HTMLElement>("[data-lightbox]");
	return { w, box };
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
	localStorage.clear();
	document.body.innerHTML = "";
});

describe("lightbox", () => {
	it("renders the photo with a responsive srcset, title and position", async () => {
		const { w, box } = await openPhoto(3);
		const el = box();
		expect(el).not.toBeNull();
		expect(el!.getAttribute("role")).toBe("dialog");
		const img = el!.querySelector<HTMLImageElement>("img[srcset]");
		expect(img?.getAttribute("src")).toContain(`/api/asset/${albumId}/${listing.ids[3]}/medium`);
		expect(img?.getAttribute("srcset")).toContain("/medium2x");
		expect(el!.textContent).toContain(`Photo ${listing.ids[3]!.slice(0, 4)}`);
		expect(el!.textContent).toContain("4 / 6");
		// Details for the current photo and its neighbours are fetched in one batched call.
		const requested = api.photos.details.mock.calls.flatMap((c) => (c[0] as { ids: string[] }).ids);
		expect(requested).toContain(listing.ids[3]);
		w.unmount();
	});

	it("shows the details sidebar and rates with the stars", async () => {
		const { w, box } = await openPhoto(0);
		const toggle = box()!.querySelector<HTMLButtonElement>('button[aria-label="Show details"]');
		expect(toggle).not.toBeNull();
		toggle!.click();
		await settle();
		const text = box()!.textContent ?? "";
		expect(text).toContain("Sunset at the pier");
		expect(text).toContain("FUJIFILM");
		expect(text).toContain("beach");
		expect(text).toContain("CC BY 4.0");
		expect(text).not.toContain("Medium");
		const star = box()!.querySelector<HTMLButtonElement>('button[aria-label="Rate 4 stars"]');
		expect(star).not.toBeNull();
		star!.click();
		await settle();
		expect(api.photos.rate).toHaveBeenCalledWith({ id: listing.ids[0], rating: 4 });
		w.unmount();
	});

	it("steps to the next photo with the arrow key and closes with escape", async () => {
		const { w } = await openPhoto(1);
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		await settle();
		expect(router.currentRoute.value.params.photoId).toBe(listing.ids[2]);
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await settle();
		expect(router.currentRoute.value.params.photoId ?? "").toBe("");
		w.unmount();
	});
});
