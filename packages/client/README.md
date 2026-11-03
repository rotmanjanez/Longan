# @longan/client

Typed API client for [Longan](https://github.com/rotmanjanez/Longan), the self-hosted photo gallery. Use it to
build integrations such as a photobox, a backup job or a custom frontend:

- `rpc`: every API procedure, fully typed from Longan's contract (`rpc.albums.create`, `rpc.photos.details`, ...)
- `upload()`: streamed photo and video uploads into an album or Unsorted
- `clientCredentials()`: Keycloak service-account tokens, cached and refreshed automatically
- `uploadFile()` (`/node`): uploads a file from disk without reading it into memory

Works in Node.js >= 20, Bun, Deno and browsers (ESM only). Use the client version that matches your Longan
server release.

## Install

Every Longan release (`vX.Y.Z`) has the client attached as a tarball. Install it straight from the release, with no
registry and no token:

```sh
npm install https://github.com/rotmanjanez/Longan/releases/download/v0.1.1/longan-client-0.1.1.tgz
# pnpm add / yarn add / bun add accept the same URL
```

The dependency is recorded under its name with the URL as its version, so you import it as `@longan/client`. To
update, install the URL of the newer release.

## Example: photobox uploading into an album

```ts
import { clientCredentials, createLonganClient } from "@longan/client";
import { uploadFile } from "@longan/client/node";

const longan = createLonganClient({
	url: "https://photos.example.com", // Longan's APP_URL
	token: clientCredentials({
		issuer: "https://sso.example.com/realms/longan", // Longan's OIDC_ISSUER
		clientId: "photobox",
		clientSecret: process.env.PHOTOBOX_SECRET!,
	}),
});

const { status, photoId } = await uploadFile(longan, "/var/photobox/IMG_0042.jpg", {
	albumId: "x2Yb7Qp3LmN8vR4tK6wZ1aCd",
});
// status: "created", or "duplicate" if the same file was uploaded before (photoId is then the existing photo)
```

`upload()` takes any fetch body (`File`, `Blob`, `ArrayBuffer`, `Uint8Array`, `ReadableStream`) in any runtime:

```ts
await longan.upload(file); // a File: name and mtime are taken from it
await longan.upload(jpegBytes, { name: "booth.jpg", albumId });
```

## RPC calls

```ts
const { id } = await longan.rpc.albums.create({ title: "Summer party" });
const head = await longan.rpc.albums.head({ id });
const photos = await longan.rpc.search.photos({ term: "tag:beach" });
```

Inputs and outputs are typed. `LonganInputs` and `LonganOutputs` give you the types by path
(`LonganOutputs["albums"]["head"]`). The zod schemas and enums of the contract are exported too (`contract`,
`AlbumTile`, `SizeVariantType`, ...).

Errors are thrown as `ORPCError` with a `code` (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`,
`CONFLICT`, `PASSWORD_REQUIRED`) and an HTTP `status`. Upload failures throw `LonganUploadError` (`code`: `FORBIDDEN`,
`NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `NETWORK`, ...). Token errors throw `LonganAuthError`.

## Authentication

| `token` option               | Use for                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `clientCredentials({ ... })` | Unattended devices and scripts (Keycloak service account)                         |
| `"eyJhbGciOi..."`            | An access token you already have                                                  |
| `async () => getToken()`     | Your own token handling, e.g. a user's token from your app's OIDC login           |
| omitted                      | Guest access (public albums), or the session cookie in a browser on Longan's site |

In a browser on another origin, pass `credentials: "include"` to send the Longan session cookie.

### Keycloak setup for a service account

1. Create a client (e.g. `photobox`) in Longan's realm. Turn on Client authentication and Service accounts, and
   turn off Standard flow.
2. Under _Service account roles_, assign `longan-upload` (or `longan-admin`).
3. Add an **Audience** mapper to the client with _Included Client Audience_ set to Longan's client (`longan`).
   Longan rejects tokens that are not issued for it.
4. Copy the client secret from the _Credentials_ tab.

The service account shows up in Longan as `service-account-photobox` after its first request. Without `albumId`
uploads go to its own Unsorted. To upload into someone's album, that user shares the album with the service
account and grants _upload_. The uploaded photos then belong to the album owner.
