-- Default theme moved from sky/slate (blue) to alpine/moss (muted green). Installs still on the old defaults follow.
UPDATE "settings" SET "value" = 'alpine' WHERE "key" = 'theme.primary' AND "value" = 'sky';--> statement-breakpoint
UPDATE "settings" SET "value" = 'moss' WHERE "key" = 'theme.neutral' AND "value" = 'slate';
