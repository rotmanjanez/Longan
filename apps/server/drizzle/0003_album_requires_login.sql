-- "Require sign-in" moved from the instance-wide site.login_required setting to each album's public row.
ALTER TABLE "access_permissions" ADD COLUMN "requires_login" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Installs that had the global switch on keep every public album closed to anonymous visitors.
UPDATE "access_permissions" SET "requires_login" = true
WHERE "user_id" IS NULL
	AND EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'site.login_required' AND "value" IN ('1', 'true'));--> statement-breakpoint
-- Same for newly created albums: "public" becomes "signed-in users"; "link only" (no signed-in variant) becomes private.
UPDATE "settings" SET "value" = CASE "value" WHEN 'public' THEN 'signed_in' ELSE 'private' END
WHERE "key" = 'albums.default_protection' AND "value" IN ('public', 'public_hidden')
	AND EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'site.login_required' AND "value" IN ('1', 'true'));--> statement-breakpoint
DELETE FROM "settings" WHERE "key" = 'site.login_required';
