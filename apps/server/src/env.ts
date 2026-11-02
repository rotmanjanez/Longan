import { z } from "zod";

const Env = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().int().default(3000),
	/** Public base URL of this instance, used for OIDC redirect URIs and absolute links. */
	APP_URL: z.string().url().default("http://localhost:3000"),
	DATABASE_URL: z.string().min(1),
	/** Directory for originals, variants and temp uploads. */
	STORAGE_PATH: z.string().default("./data"),
	/** 32+ random chars; signs session cookies. */
	SESSION_SECRET: z.string().min(32),
	SESSION_TTL_HOURS: z.coerce
		.number()
		.int()
		.default(24 * 14),

	OIDC_ISSUER: z.string().url(),
	OIDC_CLIENT_ID: z.string().min(1),
	OIDC_CLIENT_SECRET: z.string().optional(),
	/** Realm or client role names that grant admin / upload. */
	OIDC_ADMIN_ROLE: z.string().default("longan-admin"),
	OIDC_UPLOAD_ROLE: z.string().default("longan-upload"),
	/** Token claim that carries group paths (Keycloak group membership mapper). */
	OIDC_GROUPS_CLAIM: z.string().default("groups"),
	/** When set, the Keycloak Admin API is used as a user directory (needs service account with view-users). */
	KEYCLOAK_ADMIN_URL: z.string().url().optional(),

	UPLOAD_MAX_BYTES: z.coerce
		.number()
		.int()
		.default(2 * 1024 * 1024 * 1024),
	FFMPEG_PATH: z.string().default("ffmpeg"),
	FFPROBE_PATH: z.string().default("ffprobe"),
	/** Served SPA build directory (production). */
	WEB_DIST: z.string().default("../web/dist"),
	LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
	const parsed = Env.safeParse(source);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
		throw new Error(`Invalid environment:\n${issues}`);
	}
	return parsed.data;
}

export const env: Env = loadEnv();
