import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { describe, expect, it } from "vitest";
import { contract } from "../../shared/src/contract/index.ts";
import { ORPCError as ClientORPCError, createLonganClient, LonganUploadError } from "./index.ts";

const ALBUM = "AAAAAAAAAAAAAAAAAAAAAAAA";
const PHOTO = "BBBBBBBBBBBBBBBBBBBBBBBB";

type Ctx = { authorization: string | null };
const os = implement(contract).$context<Ctx>();
// A slice of the real contract, enough to exercise the wire format and auth header.
const router = {
	albums: {
		create: os.albums.create.handler(({ input, context }) => {
			if (context.authorization !== "Bearer t0k3n") throw new ORPCError("UNAUTHORIZED");
			if (input.title === "taken") throw new ORPCError("CONFLICT", { message: "exists" });
			return { id: ALBUM };
		}),
	},
};
const rpc = new RPCHandler(router);

type Seen = { url: URL; method: string; headers: Headers; body: string };

/** A fetch that serves /api/rpc from the in-memory router and /api/upload from `uploadReply`. */
function fakeServer(
	uploadReply: (req: Request) => Response = () => Response.json({ status: "created", photoId: PHOTO }),
) {
	const seen: Seen[] = [];
	const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
		const req = new Request(input, init);
		const url = new URL(req.url);
		seen.push({ url, method: req.method, headers: req.headers, body: await req.clone().text() });
		if (url.pathname.startsWith("/gallery/api/rpc/")) {
			const { matched, response } = await rpc.handle(req, {
				prefix: "/gallery/api/rpc",
				context: { authorization: req.headers.get("authorization") },
			});
			return matched ? response : new Response("not found", { status: 404 });
		}
		if (url.pathname === "/gallery/api/upload") return uploadReply(req);
		return new Response("not found", { status: 404 });
	};
	return { fetch: fetchImpl as typeof fetch, seen };
}

describe("createLonganClient", () => {
	it("calls typed RPC procedures with the bearer token from a token source", async () => {
		const server = fakeServer();
		let calls = 0;
		const client = createLonganClient({
			url: "https://photos.example.com/gallery",
			token: async () => {
				calls++;
				return "t0k3n";
			},
			fetch: server.fetch,
		});
		await expect(client.rpc.albums.create({ title: "Party" })).resolves.toEqual({ id: ALBUM });
		expect(calls).toBe(1);
		expect(server.seen[0]?.url.pathname).toBe("/gallery/api/rpc/albums/create");
	});

	it("surfaces procedure errors as ORPCError with code and status", async () => {
		const server = fakeServer();
		const anon = createLonganClient({ url: "https://photos.example.com/gallery/", fetch: server.fetch });
		const err = await anon.rpc.albums.create({ title: "x" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ClientORPCError);
		expect(err).toMatchObject({ code: "UNAUTHORIZED", status: 401 });

		const authed = createLonganClient({
			url: "https://photos.example.com/gallery",
			token: "t0k3n",
			fetch: server.fetch,
		});
		await expect(authed.rpc.albums.create({ title: "taken" })).rejects.toMatchObject({
			code: "CONFLICT",
			message: "exists",
		});
	});

	it("uploads a raw body with name, album, mtime and auth", async () => {
		const server = fakeServer();
		const client = createLonganClient({
			url: "https://photos.example.com/gallery",
			token: "t0k3n",
			fetch: server.fetch,
		});
		const res = await client.upload(new Uint8Array([1, 2, 3]), {
			name: "IMG 0042.jpg",
			albumId: ALBUM,
			mtime: new Date(1700000000000),
		});
		expect(res).toEqual({ status: "created", photoId: PHOTO });
		const req = server.seen[0]!;
		expect(req.method).toBe("PUT");
		expect(req.url.pathname).toBe("/gallery/api/upload");
		expect(Object.fromEntries(req.url.searchParams)).toEqual({
			name: "IMG 0042.jpg",
			album: ALBUM,
			mtime: "1700000000000",
		});
		expect(req.headers.get("authorization")).toBe("Bearer t0k3n");
		expect(req.body).toBe("\x01\x02\x03");
	});

	it("takes name and mtime from a File and streams ReadableStream bodies", async () => {
		const server = fakeServer();
		const client = createLonganClient({ url: "https://photos.example.com/gallery", fetch: server.fetch });
		await client.upload(new File(["hello"], "beach.png", { lastModified: 1600000000000 }));
		expect(Object.fromEntries(server.seen[0]!.url.searchParams)).toEqual({
			name: "beach.png",
			mtime: "1600000000000",
		});

		const stream = new Blob(["streamed"]).stream();
		await client.upload(stream, { name: "clip.mp4" });
		expect(server.seen[1]!.body).toBe("streamed");
		expect(server.seen[1]!.headers.get("authorization")).toBeNull();
	});

	it("requires a name for non-File bodies", async () => {
		const client = createLonganClient({ url: "https://photos.example.com", fetch: fakeServer().fetch });
		await expect(client.upload(new Blob(["x"]))).rejects.toThrow(TypeError);
	});

	it("maps upload failures to LonganUploadError", async () => {
		const forbidden = fakeServer(() =>
			Response.json({ status: "error", message: "Not allowed to upload into this album" }, { status: 403 }),
		);
		const client = createLonganClient({ url: "https://photos.example.com/gallery", fetch: forbidden.fetch });
		const err = await client
			.upload(new Blob(["x"]), { name: "a.jpg", albumId: ALBUM })
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(LonganUploadError);
		expect(err).toMatchObject({
			status: 403,
			code: "FORBIDDEN",
			message: "Not allowed to upload into this album",
		});

		const proxy = fakeServer(
			() => new Response("<html>413 Request Entity Too Large</html>", { status: 413 }),
		);
		const client2 = createLonganClient({ url: "https://photos.example.com/gallery", fetch: proxy.fetch });
		await expect(client2.upload(new Blob(["x"]), { name: "a.jpg" })).rejects.toMatchObject({
			code: "PAYLOAD_TOO_LARGE",
			message: "<html>413 Request Entity Too Large</html>",
		});

		const offline = createLonganClient({
			url: "https://photos.example.com",
			fetch: (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch,
		});
		await expect(offline.upload(new Blob(["x"]), { name: "a.jpg" })).rejects.toMatchObject({
			code: "NETWORK",
			status: 0,
		});
	});
});
