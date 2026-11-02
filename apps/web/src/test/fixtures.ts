import type { AlbumTile, PhotoRatiosSoA } from "@longan/shared";
import type { InitData, RootAlbums } from "@/api/client.ts";

export const id24 = (s: string) => s.padEnd(24, "x").slice(0, 24);

export const initData: InitData = {
	user: {
		id: 1,
		username: "alice",
		displayName: "Alice",
		email: null,
		isAdmin: false,
		mayUpload: true,
		groups: [],
	},
	rights: {
		isAdmin: false,
		mayUpload: true,
		canCreateAlbums: true,
		canUseSearch: true,
		canUseMap: true,
		canUseTimeline: true,
	},
	config: {
		title: "Test Gallery",
		version: "0.1.0",
		darkModeDefault: true,
		theme: { primary: "sky", neutral: "slate", overrides: {} },
		defaultLayout: "square",
		layout: {
			justifiedRowHeight: 200,
			squareColumnWidth: 200,
			masonryColumnWidth: 250,
			gridColumnWidth: 200,
			gap: 8,
		},
		imageOverlayType: "none",
		dateFormat: "",
		loginRequired: false,
		nsfwVisibleByDefault: false,
		nsfwBlur: true,
		downloadableVariants: ["original"],
		mapTileUrl: "https://tile.example/{z}/{x}/{y}.png",
		mapAttribution: "",
		features: { map: true, timeline: true, search: true, ratings: true },
		smartAlbums: ["recent"],
		recentAgeDays: 7,
		uploadMaxBytes: 1,
		uploadParallelism: 1,
	},
};

export function albumTile(over: Partial<AlbumTile>): AlbumTile {
	return {
		id: id24("album"),
		kind: "album",
		title: "Album",
		coverId: id24("cover"),
		coverColour: "#336699",
		isNsfw: false,
		isPublic: false,
		isLinkRequired: false,
		isLocked: false,
		hasChildren: false,
		numPhotos: 3,
		ownerId: 1,
		createdAt: "2024-01-01T00:00:00Z",
		minTakenAt: null,
		maxTakenAt: null,
		...over,
	};
}

export const rootAlbums: RootAlbums = {
	smart: [albumTile({ id: "recent", kind: "smart", title: "recent", coverId: null, ownerId: null })],
	albums: [
		albumTile({ id: id24("holiday"), title: "Holiday 2024", isPublic: true }),
		albumTile({ id: id24("secret"), title: "Secret", isLocked: true, coverId: null }),
		albumTile({ id: id24("spicy"), title: "Spicy", isNsfw: true }),
	],
	shared: [],
	tagAlbums: [],
};

export function ratios(n: number, buckets: string[]): PhotoRatiosSoA {
	const ids = Array.from({ length: n }, (_, i) => id24(`photo${i}`));
	return {
		ids,
		ratios: ids.map((_, i) => (i % 2 ? 1.5 : 0.75)),
		bucketIds: ids.map((_, i) => buckets[Math.floor((i * buckets.length) / n)] as string),
		titles: ids.map((_, i) => `Photo ${i}`),
		types: ids.map((_, i) => (i === 1 ? "video" : "image")),
		isHighlighteds: ids.map((_, i) => i === 0),
		ratingAvgs: ids.map(() => null),
		takenAts: ids.map(() => null),
		createdAts: ids.map(() => "2024-01-01T00:00:00Z"),
		colours: ids.map(() => "#884422"),
		isTruncated: false,
	};
}

/** Minimal ResizeObserver that reports a fixed content width (jsdom has no layout). */
export function installResizeObserver(width = 1000) {
	class RO {
		constructor(private cb: ResizeObserverCallback) {}
		observe(target: Element) {
			const entry = {
				target,
				contentRect: { width, height: 0, top: 0, left: 0, bottom: 0, right: width, x: 0, y: 0 },
				contentBoxSize: [{ inlineSize: width, blockSize: 0 }],
				borderBoxSize: [{ inlineSize: width, blockSize: 0 }],
			} as unknown as ResizeObserverEntry;
			queueMicrotask(() => this.cb([entry], this as unknown as ResizeObserver));
		}
		unobserve() {}
		disconnect() {}
	}
	(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
}
