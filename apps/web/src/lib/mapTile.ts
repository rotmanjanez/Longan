/** Web-mercator tile maths for the small map preview in the photo details. */
export type TileGrid = {
	/** 2x2 tile urls, row-major. */
	tiles: { url: string; col: number; row: number }[];
	/** Marker position inside the 512x512 block (px). */
	marker: { x: number; y: number };
};

export function tileUrl(template: string, z: number, x: number, y: number): string {
	return template
		.replace("{z}", String(z))
		.replace("{x}", String(x))
		.replace("{y}", String(y))
		.replace("{s}", "a")
		.replace("{r}", "");
}

/**
 * The 2x2 block of 256px tiles around a point, chosen so the point is at least 128px from every block edge.
 */
export function tileGrid(template: string, lat: number, lng: number, z = 14): TileGrid {
	const n = 2 ** z;
	const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
	const fx = ((lng + 180) / 360) * n;
	const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
	const x0 = Math.floor(fx - 0.5);
	const y0 = Math.floor(fy - 0.5);
	const tiles = [];
	for (let row = 0; row < 2; row++) {
		for (let col = 0; col < 2; col++) {
			const tx = (((x0 + col) % n) + n) % n;
			const ty = Math.min(n - 1, Math.max(0, y0 + row));
			tiles.push({ url: tileUrl(template, z, tx, ty), col, row });
		}
	}
	return { tiles, marker: { x: (fx - x0) * 256, y: (fy - y0) * 256 } };
}
