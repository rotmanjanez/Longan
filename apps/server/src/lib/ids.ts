import { randomBytes } from "node:crypto";

/** 24-char URL-safe random id (18 random bytes, base64url). Same shape as Lychee ids. */
export function newId(): string {
	return randomBytes(18).toString("base64url");
}

export function newSessionId(): string {
	return randomBytes(32).toString("base64url");
}
