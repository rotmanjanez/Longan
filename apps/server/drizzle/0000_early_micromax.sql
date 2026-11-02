CREATE TABLE "access_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"album_id" char(24) NOT NULL,
	"user_id" integer,
	"is_link_required" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"grants_full_photo_access" boolean DEFAULT false NOT NULL,
	"grants_download" boolean DEFAULT false NOT NULL,
	"grants_upload" boolean DEFAULT false NOT NULL,
	"grants_edit" boolean DEFAULT false NOT NULL,
	"grants_delete" boolean DEFAULT false NOT NULL,
	"grants_move" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'album' NOT NULL,
	"parent_id" char(24),
	"owner_id" integer NOT NULL,
	"title" text NOT NULL,
	"slug" text,
	"description" text,
	"is_nsfw" boolean DEFAULT false NOT NULL,
	"license" text,
	"cover_id" char(24),
	"photo_sort_col" text,
	"photo_sort_order" text,
	"album_sort_col" text,
	"album_sort_order" text,
	"photo_layout" text,
	"tag_logic" text DEFAULT 'or' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_album" (
	"photo_id" char(24) NOT NULL,
	"album_id" char(24) NOT NULL,
	CONSTRAINT "photo_album_photo_id_album_id_pk" PRIMARY KEY("photo_id","album_id")
);
--> statement-breakpoint
CREATE TABLE "photo_ratings" (
	"photo_id" char(24) NOT NULL,
	"user_id" integer NOT NULL,
	"rating" smallint NOT NULL,
	CONSTRAINT "photo_ratings_photo_id_user_id_pk" PRIMARY KEY("photo_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "photo_tags" (
	"photo_id" char(24) NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "photo_tags_photo_id_tag_id_pk" PRIMARY KEY("photo_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"mime" text NOT NULL,
	"filesize" bigint NOT NULL,
	"checksum" char(40) NOT NULL,
	"original_checksum" char(40) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"taken_at" timestamp with time zone,
	"taken_at_tz" text,
	"make" text,
	"model" text,
	"lens" text,
	"iso" text,
	"aperture" text,
	"shutter" text,
	"focal" text,
	"latitude" double precision,
	"longitude" double precision,
	"altitude" double precision,
	"license" text,
	"is_highlighted" boolean DEFAULT false NOT NULL,
	"rating_avg" real,
	"duration" real,
	"fps" real,
	"colours" text[] DEFAULT '{}'::text[] NOT NULL,
	"placeholder" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id_token" text,
	"unlocked_album_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "size_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"photo_id" char(24) NOT NULL,
	"type" text NOT NULL,
	"path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"filesize" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_album_tags" (
	"album_id" char(24) NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "tag_album_tags_album_id_tag_id_pk" PRIMARY KEY("album_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"sub" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"may_upload" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_permissions" ADD CONSTRAINT "access_permissions_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_permissions" ADD CONSTRAINT "access_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_parent_id_albums_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_id_photos_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_album" ADD CONSTRAINT "photo_album_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_album" ADD CONSTRAINT "photo_album_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_ratings" ADD CONSTRAINT "photo_ratings_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_ratings" ADD CONSTRAINT "photo_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_tags" ADD CONSTRAINT "photo_tags_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_tags" ADD CONSTRAINT "photo_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "size_variants" ADD CONSTRAINT "size_variants_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_album_tags" ADD CONSTRAINT "tag_album_tags_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_album_tags" ADD CONSTRAINT "tag_album_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_permissions_album_user_uq" ON "access_permissions" USING btree ("album_id",coalesce("user_id", 0));--> statement-breakpoint
CREATE INDEX "access_permissions_user_idx" ON "access_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "albums_parent_idx" ON "albums" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "albums_owner_idx" ON "albums" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "albums_slug_uq" ON "albums" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "albums_title_idx" ON "albums" USING btree ("title");--> statement-breakpoint
CREATE INDEX "jobs_status_run_at_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "photo_album_album_idx" ON "photo_album" USING btree ("album_id","photo_id");--> statement-breakpoint
CREATE INDEX "photo_tags_tag_idx" ON "photo_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "photos_owner_idx" ON "photos" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "photos_checksum_idx" ON "photos" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "photos_original_checksum_idx" ON "photos" USING btree ("original_checksum");--> statement-breakpoint
CREATE INDEX "photos_taken_at_idx" ON "photos" USING btree ("taken_at");--> statement-breakpoint
CREATE INDEX "photos_created_at_idx" ON "photos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "photos_geo_idx" ON "photos" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "size_variants_photo_type_uq" ON "size_variants" USING btree ("photo_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "users_sub_uq" ON "users" USING btree ("sub");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");