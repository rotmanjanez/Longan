-- Only the most dominant colour is used (as the fill behind a loading image); the 5-colour palette and
-- colour search are gone.
ALTER TABLE "photos" ADD COLUMN "colour" text;--> statement-breakpoint
UPDATE "photos" SET "colour" = "colours"[1] WHERE cardinality("colours") > 0;--> statement-breakpoint
ALTER TABLE "photos" DROP COLUMN "colours";
