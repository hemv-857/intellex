#!/bin/sh
# Production start for platforms that provide PORT and a persistent disk
# (Render). Prepares the data directory, applies migrations, then runs the
# Next.js standalone server.
#
# The directory creation is the important part: a fresh deploy mounts an empty
# disk, and SQLite will not create intermediate directories for you.

set -eu

PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"

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
exec bun .next/standalone/server.js