import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { type AppEnv, addHttpRoutes } from "../app.ts";
import { db } from "../db/index.ts";
import { env } from "../env.ts";
import { log } from "../lib/log.ts";
import { buildLogoutUrl, finishLogin, isHttpsApp, startLogin } from "./oidc.ts";
import {
	clearSessionCookie,
	createSession,
	deleteSession,
	readSessionId,
	setSessionCookie,
} from "./session.ts";
import { upsertUserFromClaims } from "./users.ts";

/** Short-lived signed cookie carrying state + PKCE verifier + post-login redirect between login and callback. */
const FLOW_COOKIE = "longan_oidc";
const FLOW_TTL_S = 600;
const flowCookieOpts = () =>
	({ path: "/auth", httpOnly: true, sameSite: "Lax", secure: isHttpsApp() }) as const;

type Flow = { s: string; v: string; r: string };

/** Origins a post-login redirect may point to: APP_URL, plus the Vite dev server outside production. */
function allowedOrigins(): string[] {
	const o = [new URL(env.APP_URL).origin];
	if (env.NODE_ENV !== "production") o.push("http://localhost:5173", "http://127.0.0.1:5173");
	return o;
}

/** Only same-site paths (or absolute URLs on an allowed origin) are honoured; anything else becomes "/". */
export function safeRedirect(raw: string | undefined | null, origins: string[] = allowedOrigins()): string {
	if (!raw) return "/";
	if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
	try {
		const u = new URL(raw);
		if (origins.includes(u.origin)) return u.toString();
	} catch {
		// not a URL
	}
	return "/";
}

function jsonError(c: Context<AppEnv>, status: 400 | 502 | 503, code: string, message: string) {
	return c.json({ error: { code, message } }, status);
}

async function logout(c: Context<AppEnv>) {
	let idToken: string | null = null;
	try {
		const sid = await readSessionId(c.req.raw);
		if (sid) idToken = (await deleteSession(db, sid))?.idToken ?? null;
	} catch (err) {
		log.warn("logout: session delete failed", { err: String(err) });
	}
	clearSessionCookie(c);
	// Where the IdP sends the browser afterwards: an absolute URL on an allowed origin (the SPA's origin,
	// e.g. the Vite dev server), else APP_URL.
	const back = safeRedirect(c.req.query("redirect"));
	const postLogout = back.startsWith("/") ? new URL(back, env.APP_URL).toString() : back;
	let target = postLogout;
	try {
		target = (await buildLogoutUrl(idToken, postLogout))?.toString() ?? postLogout;
	} catch (err) {
		log.warn("logout: no end-session url", { err: String(err) });
	}
	// fetch()/XHR callers get the URL to navigate to instead of a cross-origin redirect.
	const accept = c.req.header("accept") ?? "";
	if (accept.includes("application/json") && !accept.includes("text/html"))
		return c.json({ redirect: target });
	return c.redirect(target, c.req.method === "POST" ? 303 : 302);
}

addHttpRoutes((app) => {
	app.get("/auth/login", async (c) => {
		let start: Awaited<ReturnType<typeof startLogin>>;
		try {
			start = await startLogin();
		} catch (err) {
			log.error("login: identity provider unavailable", { err: String(err) });
			return jsonError(c, 503, "IDP_UNAVAILABLE", "Identity provider unavailable");
		}
		const flow: Flow = { s: start.state, v: start.codeVerifier, r: safeRedirect(c.req.query("redirect")) };
		await setSignedCookie(c, FLOW_COOKIE, JSON.stringify(flow), env.SESSION_SECRET, {
			...flowCookieOpts(),
			maxAge: FLOW_TTL_S,
		});
		return c.redirect(start.url.toString(), 302);
	});

	app.get("/auth/callback", async (c) => {
		const raw = await getSignedCookie(c, env.SESSION_SECRET, FLOW_COOKIE);
		deleteCookie(c, FLOW_COOKIE, flowCookieOpts());
		let flow: Flow | null = null;
		try {
			flow = typeof raw === "string" ? (JSON.parse(raw) as Flow) : null;
		} catch {
			flow = null;
		}
		const providerError = c.req.query("error");
		if (providerError) {
			log.warn("login: provider returned error", {
				error: providerError,
				desc: c.req.query("error_description"),
			});
			return c.redirect(flow?.r ?? "/", 302);
		}
		if (!flow?.s || !flow.v) {
			return jsonError(c, 400, "LOGIN_EXPIRED", "Login state missing or expired, please start again");
		}
		try {
			const search = new URL(c.req.url).search;
			const { claims, idToken } = await finishLogin(search, { state: flow.s, codeVerifier: flow.v });
			const user = await upsertUserFromClaims(db, claims);
			const session = await createSession(db, user.id, idToken);
			await setSessionCookie(c, session);
			log.info("login", { userId: user.id, username: user.username });
			return c.redirect(safeRedirect(flow.r), 302);
		} catch (err) {
			log.warn("login: callback failed", { err: String(err) });
			return jsonError(c, 400, "LOGIN_FAILED", "Login failed");
		}
	});

	app.post("/auth/logout", logout);
	app.get("/auth/logout", logout);
});
