import type * as Leaflet from "leaflet";

type LeafletNs = typeof Leaflet;
let loading: Promise<LeafletNs> | null = null;

/**
 * Lazily loads Leaflet + markercluster (separate chunk, only the map view needs it). markercluster is a
 * UMD bundle that extends the global `L`, so Leaflet is exposed on window first.
 */
export function loadLeaflet(): Promise<LeafletNs> {
	loading ??= (async () => {
		const mod = await import("leaflet");
		const L = ((mod as unknown as { default?: LeafletNs }).default ?? mod) as LeafletNs;
		(window as unknown as { L: LeafletNs }).L = L;
		await Promise.all([
			import("leaflet.markercluster"),
			import("leaflet/dist/leaflet.css"),
			import("leaflet.markercluster/dist/MarkerCluster.css"),
		]);
		return L;
	})();
	return loading;
}
