# Intellex

Prompt-based AI data intelligence platform. Describe what you need in plain language; Intellex plans a collection workflow, searches the web, reads each source, extracts structured records, validates them, and hands back an exportable dataset with per-record confidence scores and source links.

## How a collection runs

1. **Prompt** — `POST /api/tasks` sends the request to the LLM planner, which returns a structured workflow: objective, target schema fields, search queries, source strategy, validation rules, tags.
2. **Review** — the plan is rendered for approval. Nothing is fetched until you click **Run Collection**.
3. **Collect** — `POST /api/tasks/[id]/run` starts the engine: `web_search` per query → dedupe URLs → persist sources → `page_reader` per source → LLM extraction → validate required fields → dedupe by composite key → store records with confidence scores and source linkage.
4. **Watch** — the UI polls task status and renders the live workflow timeline, data grid, source registry, schema, and validation rules.
5. **Explore** — Datasets (cross-task semantic search), Sources registry, History timeline. Export any task as CSV, JSON, or a 3-sheet XLSX workbook (Data / Info / Sources).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Prisma + SQLite · `z-ai-web-dev-sdk` (`web_search`, `page_reader`) · Recharts · xlsx · zod · Bun

## Quickstart

Requires Bun and Node 20+.

```bash
bun install

cp .env.example .env    # then fill in APP_TOKEN, DATABASE_URL, SCHEDULER_KEY

bun run db:deploy       # apply migrations (creates db/custom.db and the schema)
bun run dev             # http://localhost:3000
```

`APP_TOKEN` is required — with it unset the API returns `503` and the UI shows an
"Authentication not configured" screen, because a data platform with no auth is
not something to expose to a network. Sign in at the prompt with that token; it is
exchanged for an httpOnly session cookie.

`DATABASE_URL` must point at a writable SQLite file. A relative `file:` value is resolved by Prisma against `prisma/schema.prisma`, so from the repo root use `file:../db/custom.db`.

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Other scripts: `bun run build`, `bun run start`, `bun run lint`, `bun test`, `bun run db:migrate` (create a migration), `bun run db:reset`.

> **Migration warning.** `DataItemFts` is a SQLite *virtual* table, which Prisma cannot model, so `prisma migrate diff` reports it as drift and will generate `DROP TABLE` statements for it and its shadow tables. Migrations touching it must be hand-authored. `src/lib/fts.ts` also recreates the index at boot if it goes missing, and search calls it before querying.

`.zscripts/` holds container-oriented helpers (`dev.sh`, `build.sh`, `start.sh`, mini-service and Python runtime builds). You do not need them for local development.

## Layout

```
src/app/api/          route handlers (see API below)
src/app/page.tsx      single-page orchestrator; section-based navigation
src/components/app/   feature components (dashboard, tasks, datasets, compare, …)
src/components/ui/    shadcn/ui primitives
src/lib/ai.ts         planner, execution engine, semantic search, extraction
src/lib/api-utils.ts  rateLimit, zod schemas, activity logging, safeApi wrapper
src/lib/db.ts         Prisma client singleton
prisma/schema.prisma  Task, DataItem, DataSource, Template, ActivityLog, Setting
worklog.md            build + QA log, 14 phases, including root-cause notes on the UI bugs fixed
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET`/`POST` | `/api/tasks` | List (pinned-first, quality score, confidence buckets) / create from prompt |
| `GET`/`PATCH`/`DELETE` | `/api/tasks/[id]` | Detail / pin, restore, purge / soft-delete to trash |
| `POST` | `/api/tasks/[id]/run` | Start collection (fire-and-forget) |
| `POST` | `/api/tasks/[id]/export` | `?format=csv\|json\|xlsx` |
| `GET`/`POST` | `/api/tasks/[id]/schedule` | Read / set recurring collection |
| `POST` | `/api/tasks/[id]/duplicate` | Clone prompt + planned schema into a new task |
| `POST` | `/api/tasks/bulk` | `delete`, `purge`, `restore`, `pin`, `unpin`, `duplicate` across ids |
| `GET` | `/api/tasks/compare?a=&b=` | Two-task metrics, shared fields/tags, per-metric winners |
| `POST` | `/api/scheduler/tick` | Fire due scheduled collections (secret-gated) |
| `GET`/`POST` | `/api/scheduler/purge-trash` | Hard-delete trash older than 30 days (secret-gated) |
| `GET`/`POST` | `/api/search` | Recency-aware semantic search across completed tasks |
| `GET` | `/api/insights` | Validity rate, confidence buckets, field completeness, source reliability, quality trend |
| `GET` | `/api/stats` | Dashboard aggregates |
| `GET` | `/api/datasets` · `/api/sources` · `/api/activity` | Cross-task explorers and audit feed |
| `GET` | `/api/public/share/[token]` | **No `APP_TOKEN` needed** — the only unauthenticated read. Authorised solely by the share token, scoped to one task's dataset |
| `GET`/`POST`/`DELETE` | `/api/tasks/[id]/share` | Create / list / revoke read-only share links |
| `GET` | `/api/sources/[id]/re-extract` (POST) | Re-read one source and replace only its records |
| `GET` | `/api/templates`, `/api/templates/[id]`, `/api/templates/seed` | Prompt templates; six built-ins seeded idempotently |
| `GET`/`POST` | `/api/preferences` | Singleton settings row |
| `POST` | `/api/templates/[id]` | Record a template use (drives the "used N×" badge) |

## Sharing a dataset

A completed collection can be published as a read-only link (`Share dataset…` in the task's overflow menu). The token is 32 random bytes, shown exactly once and stored only as a SHA-256 hash, so a database leak cannot be turned into working links. Links default to 30 days, can be revoked instantly, and resolve to that one task's dataset and nothing else — verified by test in `tests/share.test.ts`.

## Features

- **SQL-side search** — records are matched by an FTS5 index (title, summary, record JSON, task title and tags) maintained by triggers, so search no longer loads the corpus into Node. The LLM is consulted only to *widen* a query that found nothing, and that widening runs through FTS too. `contentDate` is parsed once at write time so date filtering and latest-sorting happen in SQL.
- **Insight aggregates in SQL** — validity, confidence buckets, per-field completeness (`json_each`), source reliability and the 14-day quality trend are all `GROUP BY` queries. `tests/quality-sql.test.ts` executes the production SQL fragment against a real SQLite engine and fails if it drifts from the TypeScript implementation.
- **Re-extract a source** — re-read one page and replace only its records; far cheaper than re-running a collection, and a failed read leaves existing data untouched.
- **Bulk duplicate** — clone several tasks from the selection bar; single and bulk share one clone implementation.
- **Spotlight onboarding** — the tour points at real sidebar elements and falls back to a centred card when a target is hidden (mobile).
- **Quality scoring** — per task: `validityRate*50 + sourceCoverage*25 + (1-dupRate)*25`, with a colour-coded badge and a high/medium/low confidence bar.
- **Clickable confidence drilldown** — filter a task's Data tab by confidence bucket.
- **Scheduling** — per-task interval; the tick endpoint advances `nextRunAt` before firing so a duplicate tick cannot double-run a task.
- **Pin, trash, bulk ops** — soft delete with restore, purge, and multi-select actions.
- **Compare** — side-by-side metrics with winners and a print-optimized PDF export.
- **Activity log** — every mutation logged with a relative timestamp; survives task deletion in the message.
- **Keyboard first** — ⌘K command palette, vim-style `g`+key navigation, `?` cheat sheet, first-run onboarding tour.
- **Exports** — CSV, JSON, and XLSX with confidence and source columns.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_TOKEN` | yes | Single-tenant access token. The whole `/api` surface is gated on it; unset means the API is **disabled** (`503`), never open |
| `DATABASE_URL` | yes | SQLite file path |
| `TRUST_PROXY` | no | Set to `1` **only** when a proxy (Caddy/nginx) sets `X-Forwarded-For`. Otherwise forwarding headers are ignored so a client cannot mint a fresh rate-limit bucket per request |
| `SCHEDULER_KEY` | for scheduling | Shared secret for `/api/scheduler/*`. **Unset means the scheduler is disabled** — the endpoints return `503`, they do not fall back to a default |
| `NEXT_PUBLIC_SCHEDULER_KEY` | for browser-triggered scheduling | Same value, exposed to the client so it can poll the tick |

The scheduler endpoints carry their own `SCHEDULER_KEY` and are deliberately exempt from the `APP_TOKEN` gate, so a cron driver only needs that one credential. They **fail closed**: no configured key means no scheduling, and the comparison is timing-safe.

The browser deliberately does **not** hold `SCHEDULER_KEY` — anything in `NEXT_PUBLIC_*` is inlined into the public JS bundle, so a client-side scheduler key is not a secret. Drive the scheduler from cron or launchd instead; `scripts/scheduler-tick.sh` is ready to use and documents the crontab line.

## Durability

Execution is still fire-and-forget in-process, but a run is no longer able to strand itself:

- A run **claims a lease** (token + timestamp) with a single conditional update, so claiming is atomic rather than check-then-act.
- The lease, not the status string, gates concurrency: a run that dies mid-flight stops blocking the task once its lease expires.
- A **reaper** on every scheduler tick flips expired runs to `failed` with an explanatory message, so the UI stops spinning and the task is re-runnable.
- Clearing the previous attempt and writing the new one is transactional.

A durable job queue is still the right answer for production-scale reliability; the lease makes the current shape recoverable rather than corrupting.

## Known limitations

- Scheduling requires an external cron/launchd driver (`scripts/scheduler-tick.sh`). There is no in-process scheduler.
- Rate limiting is per-process and in-memory, so it does not span instances.
- The quality score reads the denormalised `stats` blob written at run time; if it is missing the live row counts are used instead.
- Rate limiting is per-IP and in-memory, so it resets on restart and does not span instances.
- Tag filtering runs in memory rather than in SQL — fine at this scale, not at large row counts.
- `page_reader` returns empty HTML for some JavaScript-heavy sites. Those sources are marked failed and the run continues.
- SQLite is single-writer; concurrent collections will contend.

## Development log

`worklog.md` is the chronological build log: 14 phases from initial build through production hardening, each with what changed, how it was verified, and the root cause behind the layout bugs that were fixed (flex `min-h-0` vs Radix `ScrollArea` overflow, to name two).