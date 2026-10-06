#!/bin/sh
# Production start for Render. Prepares the data directory, applies migrations,
# then runs the Next.js standalone server.
#
# The directory creation is the important part: a fresh deploy starts with no
# database file, and SQLite will not create intermediate directories for you.
#
# On a paid plan with a disk mounted at /var/data, DATABASE_URL points there and
# the data survives deploys. On the free plan there is no disk, so DATABASE_URL
# sits under the project directory and the database is reset on every deploy.

set -eu

# Render injects PORT for web services, but on the free plan it is not always
# present at boot and Next then falls back to its own 3000/10000. Binding
# something other than $PORT makes Render's port scan wait ~15 minutes and
# then fail the deploy, so default to the port Render probes.
PORT="${PORT:-10000}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"

# Next's standalone server reads PORT from the environment; make the resolved
# value explicit so it can never disagree with the shell variable above.
export PORT HOSTNAME

# Derive the directory from DATABASE_URL so the two can never disagree.
DB_PATH="${DATABASE_URL#file:}"
if [ -z "$DB_PATH" ] || [ "$DB_PATH" = "$DATABASE_URL" ]; then
  DB_PATH="./db/custom.db"
fi
DB_DIR=$(dirname "$DB_PATH")

mkdir -p "$DB_DIR"
echo "[start] data directory ready: $DB_DIR"

# Migrations are idempotent, so running them here is safe even if the build step
# already applied them.
if [ -d node_modules/.bin ] || [ -d node_modules/prisma ]; then
  echo "[start] applying migrations"
  bunx prisma migrate deploy || echo "[start] migrate deploy failed — continuing (schema may be current already)"
fi

echo "[start] listening on $HOSTNAME:$PORT"
PORT="$PORT" HOSTNAME="$HOSTNAME" exec bun .next/standalone/server.js
