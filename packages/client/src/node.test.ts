import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLonganClient } from "./index.ts";
import { uploadFile } from "./node.ts";

let dir: string;
beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "longan-client-"));
});
afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("uploadFile", () => {
	it("streams a file from disk with its base name and mtime", async () => {
		const path = join(dir, "IMG_0001.jpg");
		await writeFile(path, "jpeg bytes");
		await utimes(path, new Date(1700000000000), new Date(1700000000000));

		let seen: { url: URL; body: string } | null = null;
		const client = createLonganClient({
			url: "https://photos.example.com",
			token: "t",
			fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
				const req = new Request(input, init);
				seen = { url: new URL(req.url), body: await req.text() };
				return Response.json({ status: "duplicate", photoId: "BBBBBBBBBBBBBBBBBBBBBBBB" });
			}) as typeof fetch,
		});

		await expect(uploadFile(client, path, { albumId: "AAAAAAAAAAAAAAAAAAAAAAAA" })).resolves.toEqual({
			status: "duplicate",
			photoId: "BBBBBBBBBBBBBBBBBBBBBBBB",
		});
		expect(seen!.body).toBe("jpeg bytes");
		expect(Object.fromEntries(seen!.url.searchParams)).toEqual({
			name: "IMG_0001.jpg",
			album: "AAAAAAAAAAAAAAAAAAAAAAAA",
			mtime: "1700000000000",
		});
	});
});
