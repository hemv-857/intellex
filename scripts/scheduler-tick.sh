#!/bin/bash
# Drive the Intellex scheduler from cron or launchd instead of the browser.
#
# Why this exists: the scheduler secret used to be read from NEXT_PUBLIC_*, which
# inlines it into the public JS bundle — any visitor could read it and trigger
# runs. The browser no longer holds the key; this script does, server-side.
#
# cron entry (every minute):
#   * * * * * /Users/you/Desktop/Intellex/scripts/scheduler-tick.sh >> /tmp/intellex-scheduler.log 2>&1
#
# launchd: see scripts/launchd/com.hemang.intellex-scheduler.plist

set -uo pipefail

BASE_URL="${INTELLEX_URL:-http://localhost:3000}"
KEY="${SCHEDULER_KEY:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load SCHEDULER_KEY from .env when the environment does not already provide it.
if [ -z "$KEY" ] && [ -f "$SCRIPT_DIR/../.env" ]; then
  KEY="$(grep -E '^SCHEDULER_KEY=' "$SCRIPT_DIR/../.env" | head -1 | cut -d= -f2- | tr -d '"'\''[:space:]')"
fi

if [ -z "$KEY" ]; then
  echo "$(date -u +%FT%TZ) scheduler-tick: SCHEDULER_KEY not set, skipping (endpoint is disabled anyway)"
  exit 0
fi

tick() {
  local out code
  out="$(curl -sS -m 30 -w '\n%{http_code}' "${BASE_URL}/api/scheduler/tick?key=${KEY}" 2>&1)" || {
    echo "$(date -u +%FT%TZ) scheduler-tick: request failed: ${out}"
    return 1
  }
  code="$(printf '%s' "$out" | tail -1)"
  body="$(printf '%s' "$out" | sed '$d')"
  echo "$(date -u +%FT%TZ) scheduler-tick: HTTP ${code} ${body}"
  [ "$code" = "200" ] || return 1
}

purge_trash() {
  local out code
  out="$(curl -sS -m 30 -X POST -w '\n%{http_code}' "${BASE_URL}/api/scheduler/purge-trash?key=${KEY}" 2>&1)" || {
    echo "$(date -u +%FT%TZ) purge-trash: request failed: ${out}"
    return 1
  }
  code="$(printf '%s' "$out" | tail -1)"
  body="$(printf '%s' "$out" | sed '$d')"
  echo "$(date -u +%FT%TZ) purge-trash: HTTP ${code} ${body}"
  [ "$code" = "200" ] || return 1
}

tick || exit 1

# Hourly trash sweep — the endpoint is idempotent, so a daily-ish cadence is fine.
if [ "$(date -u +%M)" = "00" ] && [ "$(date -u +%H)" = "03" ]; then
  purge_trash
fi

exit 0