import { relations, type SQL, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	char,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	serial,
	smallint,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
const id24 = (name: string) => char(name, { length: 24 });

/** Identities come from Keycloak; a row is created on first login (or when pre-provisioned for sharing). */
export const users = pgTable(
	"users",
	{
		id: serial("id").primaryKey(),
		sub: text("sub").notNull(),
		username: text("username").notNull(),
		displayName: text("display_name").notNull(),
		email: text("email"),
		roles: text("roles").array().notNull().default(sql`'{}'::text[]`),
		groups: text("groups").array().notNull().default(sql`'{}'::text[]`),
		isAdmin: boolean("is_admin").notNull().default(false),
		mayUpload: boolean("may_upload").notNull().default(false),
		lastLoginAt: ts("last_login_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [uniqueIndex("users_sub_uq").on(t.sub), index("users_username_idx").on(t.username)],
);

export const sessions = pgTable(
	"sessions",
	{
		id: text("id").primaryKey(),
		/** NULL for anonymous sessions, which only exist to remember unlocked password albums. */
		userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
		expiresAt: ts("expires_at").notNull(),
		/** Needed for RP-initiated logout. */
		idToken: text("id_token"),
		unlockedAlbumIds: text("unlocked_album_ids").array().notNull().default(sql`'{}'::text[]`),
		createdAt: createdAt(),
	},
	(t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** Regular albums form a tree via parent_id. Tag albums (kind='tag') are root-level and compute their photos from tag_album_tags. */
export const albums = pgTable(
	"albums",
	{
		id: id24("id").primaryKey(),
		kind: text("kind", { enum: ["album", "tag"] })
			.notNull()
			.default("album"),
		parentId: id24("parent_id").references((): AnyPgColumn => albums.id, { onDelete: "cascade" }),
		ownerId: integer("owner_id")
			.notNull()
			.references(() => users.id),
		title: text("title").notNull(),
		slug: text("slug"),
		description: text("description"),
		isNsfw: boolean("is_nsfw").notNull().default(false),
		license: text("license"),
		coverId: id24("cover_id").references((): AnyPgColumn => photos.id, { onDelete: "set null" }),
		photoSortCol: text("photo_sort_col"),
		photoSortOrder: text("photo_sort_order"),
		albumSortCol: text("album_sort_col"),
		albumSortOrder: text("album_sort_order"),
		photoLayout: text("photo_layout"),
		tagLogic: text("tag_logic", { enum: ["or", "and"] })
			.notNull()
			.default("or"),
		publishedAt: ts("published_at"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		index("albums_parent_idx").on(t.parentId),
		index("albums_owner_idx").on(t.ownerId),
		uniqueIndex("albums_slug_uq").on(t.slug),
		index("albums_title_idx").on(t.title),
	],
);

export const photos = pgTable(
	"photos",
	{
		id: id24("id").primaryKey(),
		ownerId: integer("owner_id")
			.notNull()
			.references(() => users.id),
		title: text("title").notNull(),
		description: text("description"),
		type: text("type", { enum: ["image", "video"] }).notNull(),
		mime: text("mime").notNull(),
		filesize: bigint("filesize", { mode: "number" }).notNull(),
		/** sha1 of the stored original. */
		checksum: char("checksum", { length: 40 }).notNull(),
		/** sha1 of the uploaded bytes before any conversion (HEIC -> jpeg); used for duplicate detection. */
		originalChecksum: char("original_checksum", { length: 40 }).notNull(),
		width: integer("width").notNull(),
		height: integer("height").notNull(),
		takenAt: ts("taken_at"),
		takenAtTz: text("taken_at_tz"),
		make: text("make"),
		model: text("model"),
		lens: text("lens"),
		iso: text("iso"),
		aperture: text("aperture"),
		shutter: text("shutter"),
		focal: text("focal"),
		latitude: doublePrecision("latitude"),
		longitude: doublePrecision("longitude"),
		altitude: doublePrecision("altitude"),
		license: text("license"),
		isHighlighted: boolean("is_highlighted").notNull().default(false),
		ratingAvg: real("rating_avg"),
		duration: real("duration"),
		fps: real("fps"),
		/** Up to 5 dominant colours as #rrggbb, most dominant first. */
		colours: text("colours").array().notNull().default(sql`'{}'::text[]`),
		/** base64 webp, 16px, no data: prefix. */
		placeholder: text("placeholder"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		index("photos_owner_idx").on(t.ownerId),
		index("photos_checksum_idx").on(t.checksum),
		index("photos_original_checksum_idx").on(t.originalChecksum),
		index("photos_taken_at_idx").on(t.takenAt),
		index("photos_created_at_idx").on(t.createdAt),
		index("photos_geo_idx").on(t.latitude, t.longitude),
	],
);

/** A photo can live in several albums (copy = link). Photos with no row are "unsorted". */
export const photoAlbum = pgTable(
	"photo_album",
	{
		photoId: id24("photo_id")
			.notNull()
			.references(() => photos.id, { onDelete: "cascade" }),
		albumId: id24("album_id")
			.notNull()
			.references(() => albums.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({ columns: [t.photoId, t.albumId] }),
		index("photo_album_album_idx").on(t.albumId, t.photoId),
	],
);

export const sizeVariants = pgTable(
	"size_variants",
	{
		id: serial("id").primaryKey(),
		photoId: id24("photo_id")
			.notNull()
			.references(() => photos.id, { onDelete: "cascade" }),
		type: text("type", {
			enum: ["original", "medium2x", "medium", "small2x", "small", "thumb2x", "thumb"],
		}).notNull(),
		/** Relative to STORAGE_PATH, e.g. "medium/3f/a9/<28hex>.webp". */
		path: text("path").notNull(),
		width: integer("width").notNull(),
		height: integer("height").notNull(),
		filesize: bigint("filesize", { mode: "number" }).notNull(),
	},
	(t) => [uniqueIndex("size_variants_photo_type_uq").on(t.photoId, t.type)],
);

/**
 * One row = one grant on one album. user_id NULL = the public grant (album is public iff such a row exists).
 * Per-user rows win over the public row. Nothing is inherited down the tree.
 * A public row with requires_login only opens the album to signed-in users, never to anonymous visitors.
 */
export const accessPermissions = pgTable(
	"access_permissions",
	{
		id: serial("id").primaryKey(),
		albumId: id24("album_id")
			.notNull()
			.references(() => albums.id, { onDelete: "cascade" }),
		userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
		/** Public but hidden from listings; reachable by URL. */
		isLinkRequired: boolean("is_link_required").notNull().default(false),
		/** Public row only: open to signed-in users, hidden from anonymous visitors. */
		requiresLogin: boolean("requires_login").notNull().default(false),
		passwordHash: text("password_hash"),
		grantsFullPhotoAccess: boolean("grants_full_photo_access").notNull().default(false),
		grantsDownload: boolean("grants_download").notNull().default(false),
		grantsUpload: boolean("grants_upload").notNull().default(false),
		grantsEdit: boolean("grants_edit").notNull().default(false),
		grantsDelete: boolean("grants_delete").notNull().default(false),
		grantsMove: boolean("grants_move").notNull().default(false),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		uniqueIndex("access_permissions_album_user_uq").on(t.albumId, sql`coalesce(${t.userId}, 0)`),
		index("access_permissions_user_idx").on(t.userId),
	],
);

export const tags = pgTable("tags", {
	id: serial("id").primaryKey(),
	name: text("name").notNull().unique(),
});

export const photoTags = pgTable(
	"photo_tags",
	{
		photoId: id24("photo_id")
			.notNull()
			.references(() => photos.id, { onDelete: "cascade" }),
		tagId: integer("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.photoId, t.tagId] }), index("photo_tags_tag_idx").on(t.tagId)],
);

/** Tag criteria of a tag album. */
export const tagAlbumTags = pgTable(
	"tag_album_tags",
	{
		albumId: id24("album_id")
			.notNull()
			.references(() => albums.id, { onDelete: "cascade" }),
		tagId: integer("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.albumId, t.tagId] })],
);

export const photoRatings = pgTable(
	"photo_ratings",
	{
		photoId: id24("photo_id")
			.notNull()
			.references(() => photos.id, { onDelete: "cascade" }),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		rating: smallint("rating").notNull(),
	},
	(t) => [primaryKey({ columns: [t.photoId, t.userId] })],
);

/** Flat key/value settings, seeded by src/db/seed.ts. */
export const settings = pgTable("settings", {
	key: text("key").primaryKey(),
	value: text("value"),
	type: text("type").notNull(),
	category: text("category").notNull(),
	description: text("description").notNull().default(""),
	sort: integer("sort").notNull().default(0),
});

export const jobs = pgTable(
	"jobs",
	{
		id: serial("id").primaryKey(),
		type: text("type").notNull(),
		payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
		status: text("status", { enum: ["pending", "running", "done", "failed"] })
			.notNull()
			.default("pending"),
		attempts: integer("attempts").notNull().default(0),
		runAt: ts("run_at").notNull().defaultNow(),
		lastError: text("last_error"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index("jobs_status_run_at_idx").on(t.status, t.runAt)],
);

export const albumsRelations = relations(albums, ({ one, many }) => ({
	owner: one(users, { fields: [albums.ownerId], references: [users.id] }),
	parent: one(albums, { fields: [albums.parentId], references: [albums.id], relationName: "tree" }),
	children: many(albums, { relationName: "tree" }),
	cover: one(photos, { fields: [albums.coverId], references: [photos.id] }),
	permissions: many(accessPermissions),
	photoLinks: many(photoAlbum),
	tagCriteria: many(tagAlbumTags),
}));
export const photosRelations = relations(photos, ({ one, many }) => ({
	owner: one(users, { fields: [photos.ownerId], references: [users.id] }),
	sizeVariants: many(sizeVariants),
	albumLinks: many(photoAlbum),
	tagLinks: many(photoTags),
	ratings: many(photoRatings),
}));
export const photoAlbumRelations = relations(photoAlbum, ({ one }) => ({
	photo: one(photos, { fields: [photoAlbum.photoId], references: [photos.id] }),
	album: one(albums, { fields: [photoAlbum.albumId], references: [albums.id] }),
}));
export const sizeVariantsRelations = relations(sizeVariants, ({ one }) => ({
	photo: one(photos, { fields: [sizeVariants.photoId], references: [photos.id] }),
}));
export const accessPermissionsRelations = relations(accessPermissions, ({ one }) => ({
	album: one(albums, { fields: [accessPermissions.albumId], references: [albums.id] }),
	user: one(users, { fields: [accessPermissions.userId], references: [users.id] }),
}));
export const photoTagsRelations = relations(photoTags, ({ one }) => ({
	photo: one(photos, { fields: [photoTags.photoId], references: [photos.id] }),
	tag: one(tags, { fields: [photoTags.tagId], references: [tags.id] }),
}));
export const tagAlbumTagsRelations = relations(tagAlbumTags, ({ one }) => ({
	album: one(albums, { fields: [tagAlbumTags.albumId], references: [albums.id] }),
	tag: one(tags, { fields: [tagAlbumTags.tagId], references: [tags.id] }),
}));

export type User = typeof users.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type SizeVariant = typeof sizeVariants.$inferSelect;
export type AccessPermission = typeof accessPermissions.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type SqlBool = SQL<boolean>;
