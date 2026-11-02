#!/bin/sh
# Apply database migrations (and seed default settings), then run the given command (default: the server).
# Set SKIP_MIGRATIONS=1 to skip, e.g. for one-off CLI runs:
#   docker compose run --rm -e SKIP_MIGRATIONS=1 app node apps/server/src/cli/index.ts doctor
set -e
cd /app
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
	node apps/server/src/db/migrate.ts
fi
exec "$@"
