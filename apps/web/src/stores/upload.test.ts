import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUploadResponse, uploadUrl, useUploadStore, xhrTransport } from "./upload.ts";

/** Minimal XMLHttpRequest double: records requests, lets the test finish them. */
class FakeXHR {
	static all: FakeXHR[] = [];
	method = "";
	url = "";
	headers: Record<string, string> = {};
	body: unknown = null;
	withCredentials = false;
	status = 0;
	responseText = "";
	upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } =
		{
			onprogress: null,
		};
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;
	ontimeout: (() => void) | null = null;
	aborted = false;
	constructor() {
		FakeXHR.all.push(this);
	}
	open(method: string, url: string) {
		this.method = method;
		this.url = url;
	}
	setRequestHeader(k: string, v: string) {
		this.headers[k] = v;
	}
	send(body: unknown) {
		this.body = body;
	}
	abort() {
		this.aborted = true;
		this.onabort?.();
	}
	progress(loaded: number, total: number) {
		this.upload.onprogress?.({ lengthComputable: true, loaded, total });
	}
	respond(status: number, body: unknown) {
		this.status = status;
		this.responseText = typeof body === "string" ? body : JSON.stringify(body);
		this.onload?.();
	}
	fail() {
		this.onerror?.();
	}
}

const file = (name: string, size = 10, type = "image/jpeg") =>
	new File([new Uint8Array(size)], name, { type, lastModified: 1_700_000_000_000 });
const flush = () => new Promise((r) => setTimeout(r, 0));
const ALBUM = "AbCdEfGhIjKlMnOpQrStUvWx";

beforeEach(() => {
	setActivePinia(createPinia());
	FakeXHR.all = [];
	vi.stubGlobal("XMLHttpRequest", FakeXHR);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe("upload request shape", () => {
	it("PUTs the raw file with album, encoded name and mtime", async () => {
		const progress = vi.fn();
		const f = file("Ferien 2024 & co.jpg");
		const h = xhrTransport(f, ALBUM, progress);
		const xhr = FakeXHR.all[0]!;
		expect(xhr.method).toBe("PUT");
		expect(xhr.url).toBe(`/api/upload?album=${ALBUM}&name=Ferien+2024+%26+co.jpg&mtime=1700000000000`);
		expect(xhr.headers["Content-Type"]).toBe("image/jpeg");
		expect(xhr.withCredentials).toBe(true);
		expect(xhr.body).toBe(f);
		xhr.progress(5, 10);
		expect(progress).toHaveBeenCalledWith(0.5);
		xhr.respond(200, { status: "created", photoId: "p1" });
		expect(await h.promise).toEqual({ ok: true, status: "created", photoId: "p1" });
	});

	it("uses an empty album for unsorted and octet-stream for unknown types", () => {
		xhrTransport(file("x.heic", 1, ""), null, () => {});
		const xhr = FakeXHR.all[0]!;
		expect(new URL(xhr.url, "http://x").searchParams.get("album")).toBe("");
		expect(xhr.headers["Content-Type"]).toBe("application/octet-stream");
		expect(uploadUrl(file("a.jpg"), null)).toContain("album=&");
	});

	it("maps error bodies and statuses", () => {
		expect(
			parseUploadResponse(
				415,
				JSON.stringify({ status: "error", error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "nope" } }),
			),
		).toEqual({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE", message: "nope" });
		expect(parseUploadResponse(502, "Bad gateway")).toEqual({
			ok: false,
			code: "HTTP_502",
			message: "Bad gateway",
		});
		expect(parseUploadResponse(200, JSON.stringify({ status: "duplicate", photoId: "p" }))).toEqual({
			ok: true,
			status: "duplicate",
			photoId: "p",
		});
	});
});

describe("upload queue", () => {
	it("never runs more than `parallelism` transfers and drains the queue in order", async () => {
		const store = useUploadStore();
		store.configure({ parallelism: 2 });
		const batches: number[] = [];
		store.onBatchDone((s) => batches.push(s.length));
		store.enqueue([file("a.jpg"), file("b.jpg"), file("c.jpg"), file("d.jpg")], ALBUM);
		expect(FakeXHR.all.length).toBe(2);
		expect(store.items.map((i) => i.status)).toEqual(["uploading", "uploading", "queued", "queued"]);

		FakeXHR.all[0]!.respond(200, { status: "created", photoId: "p1" });
		await flush();
		expect(FakeXHR.all.length).toBe(3);
		expect(new URL(FakeXHR.all[2]!.url, "http://x").searchParams.get("name")).toBe("c.jpg");
		expect(store.uploading.length).toBe(2);

		FakeXHR.all[1]!.respond(200, { status: "duplicate", photoId: "p2" });
		FakeXHR.all[2]!.respond(200, { status: "created", photoId: "p3" });
		await flush();
		expect(FakeXHR.all.length).toBe(4);
		expect(batches).toEqual([]);
		FakeXHR.all[3]!.respond(200, { status: "created", photoId: "p4" });
		await flush();
		expect(store.items.map((i) => i.status)).toEqual(["created", "duplicate", "created", "created"]);
		expect(store.isActive).toBe(false);
		expect(store.progress).toBe(1);
		expect(batches).toEqual([4]);
	});

	it("rejects files over the size limit without uploading them, and never retries them", async () => {
		const store = useUploadStore();
		store.configure({ parallelism: 3, maxBytes: 100 });
		store.enqueue([file("big.jpg", 101), file("ok.jpg", 100)], null);
		expect(FakeXHR.all.length).toBe(1);
		const [big, ok] = store.items;
		expect(big).toMatchObject({ status: "error", code: "PAYLOAD_TOO_LARGE", retryable: false });
		expect(ok!.status).toBe("uploading");
		store.retry(big!.id);
		expect(store.items[0]!.status).toBe("error");
		expect(FakeXHR.all.length).toBe(1);
	});

	it("marks failures, retries them and recovers", async () => {
		const store = useUploadStore();
		store.configure({ parallelism: 1 });
		store.enqueue([file("a.jpg"), file("b.jpg")], ALBUM);
		FakeXHR.all[0]!.respond(500, {
			status: "error",
			error: { code: "INTERNAL_SERVER_ERROR", message: "boom" },
		});
		await flush();
		expect(store.items[0]).toMatchObject({ status: "error", code: "INTERNAL_SERVER_ERROR", message: "boom" });
		expect(store.items[1]!.status).toBe("uploading");
		FakeXHR.all[1]!.fail();
		await flush();
		expect(store.items[1]).toMatchObject({ status: "error", code: "NETWORK" });
		expect(store.failed.length).toBe(2);

		store.retryFailed();
		expect(store.items.map((i) => i.status)).toEqual(["uploading", "queued"]);
		FakeXHR.all[2]!.respond(200, { status: "created", photoId: "p1" });
		await flush();
		FakeXHR.all[3]!.respond(200, { status: "created", photoId: "p2" });
		await flush();
		expect(store.failed.length).toBe(0);
		expect(store.succeeded.map((i) => i.photoId)).toEqual(["p1", "p2"]);
	});

	it("cancels queued and running uploads, freeing the slot", async () => {
		const store = useUploadStore();
		store.configure({ parallelism: 1 });
		store.enqueue([file("a.jpg"), file("b.jpg"), file("c.jpg")], ALBUM);
		const [a, b] = store.items;
		store.cancel(b!.id);
		store.cancel(a!.id);
		expect(FakeXHR.all[0]!.aborted).toBe(true);
		await flush();
		expect(store.items.map((i) => i.status)).toEqual(["cancelled", "cancelled", "uploading"]);
		expect(FakeXHR.all.length).toBe(2);
		store.retry(a!.id);
		expect(store.items[0]!.status).toBe("queued");
	});
});
