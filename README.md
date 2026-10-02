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

cp .env.example .env    # then fill in DATABASE_URL and SCHEDULER_KEY

bun run db:generate
bun run db:push     # creates db/custom.db and the schema
bun run dev         # http://localhost:3000
```

`DATABASE_URL` must point at a writable SQLite file. A relative `file:` value is resolved by Prisma against `prisma/schema.prisma`, so from the repo root use `file:../db/custom.db`. Generate a scheduler key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Other scripts: `bun run build`, `bun run start`, `bun run lint`, `bun test`, `bun run db:reset`.

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
| `POST` | `/api/tasks/bulk` | `delete`, `purge`, `restore`, `pin`, `unpin` across ids |
| `GET` | `/api/tasks/compare?a=&b=` | Two-task metrics, shared fields/tags, per-metric winners |
| `POST` | `/api/scheduler/tick` | Fire due scheduled collections (secret-gated) |
| `GET`/`POST` | `/api/scheduler/purge-trash` | Hard-delete trash older than 30 days (secret-gated) |
| `GET`/`POST` | `/api/search` | Recency-aware semantic search across completed tasks |
| `GET` | `/api/insights` | Validity rate, confidence buckets, field completeness, source reliability, quality trend |
| `GET` | `/api/stats` | Dashboard aggregates |
| `GET` | `/api/datasets` · `/api/sources` · `/api/activity` | Cross-task explorers and audit feed |
| `GET`/`POST` | `/api/templates`, `/api/templates/[id]`, `/api/templates/seed` | Prompt templates; six built-ins seeded idempotently |
| `GET`/`POST` | `/api/preferences` | Singleton settings row |

## Features

- **Semantic search** — LLM query expansion (cached 5 min) plus weighted field scoring, recency decay, date-range filter, and relevance/latest sort.
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
| `DATABASE_URL` | yes | SQLite file path |
| `SCHEDULER_KEY` | for scheduling | Shared secret for `/api/scheduler/*`. **Unset means the scheduler is disabled** — the endpoints return `503`, they do not fall back to a default |
| `NEXT_PUBLIC_SCHEDULER_KEY` | for browser-triggered scheduling | Same value, exposed to the client so it can poll the tick |

The scheduler endpoints are the only mutating routes that do not authenticate a user, so they **fail closed**: no configured key means no scheduling, and the comparison is timing-safe.

Because `NEXT_PUBLIC_*` values are inlined into the JS bundle, any visitor can read that key and trigger the tick themselves — the client-polling model makes the key public by design. For a deployed instance, drive `/api/scheduler/tick` from cron or a launchd timer with a real `SCHEDULER_KEY` and leave `NEXT_PUBLIC_SCHEDULER_KEY` unset, so the browser never holds it.

## Known limitations

- Collection execution is fire-and-forget inside the Next.js process. Fine for dev; a durable job queue is needed for production-grade reliability.
- Scheduling is triggered by whoever polls the tick endpoint. Server-side cron (rather than browser polling) is the right shape for a deployment, and is not implemented here.
- Rate limiting is per-IP and in-memory, so it resets on restart and does not span instances.
- Tag filtering runs in memory rather than in SQL — fine at this scale, not at large row counts.
- `page_reader` returns empty HTML for some JavaScript-heavy sites. Those sources are marked failed and the run continues.
- SQLite is single-writer; concurrent collections will contend.

## Development log

`worklog.md` is the chronological build log: 14 phases from initial build through production hardening, each with what changed, how it was verified, and the root cause behind the layout bugs that were fixed (flex `min-h-0` vs Radix `ScrollArea` overflow, to name two).