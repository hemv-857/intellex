# Intellex — AI Data Intelligence Platform

## Project Status (Initial Build — Complete)

A prompt-based AI Data Intelligence Platform that turns natural-language business
requests into clean, structured, source-backed datasets with a managed end-to-end
workflow.

### Architecture
- **Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui**
- **Prisma + SQLite** for persistence (Task, DataItem, DataSource models)
- **z-ai-web-dev-sdk** (backend only) for LLM planning, `web_search`, `page_reader`
- Single user-visible route `/` with section-based navigation (Dashboard, New
  Collection, Tasks, Task Detail, Datasets, Sources, History)

### Core Flow
1. User writes a natural-language prompt → `POST /api/tasks` calls the LLM planner
   which returns a structured workflow (objective, target schema fields, search
   queries, source strategy, validation rules, tags).
2. User reviews the plan and clicks **Run Collection** → `POST /api/tasks/[id]/run`
   fires-and-forgets `executeWorkflow()` (async, process stays alive in `next dev`).
3. The engine: runs `web_search` per query → dedupes URLs → persists DataSource rows →
   `page_reader` for each source → LLM extracts structured records per page →
   validates required fields → deduplicates by composite key → stores DataItems with
   confidence scores and source linkage.
4. Frontend polls task status while running and renders the live workflow timeline,
   data table, source registry, schema, and validation rules.
5. Datasets explorer, Sources registry, and History timeline aggregate across tasks;
   CSV / JSON export supported per task.

### Files produced
- `prisma/schema.prisma` — Task / DataItem / DataSource
- `src/lib/ai.ts` — planner + execution engine + ZAI singleton
- `src/app/api/tasks/route.ts` — list + create
- `src/app/api/tasks/[id]/route.ts` — detail + delete
- `src/app/api/tasks/[id]/run/route.ts` — async execution
- `src/app/api/tasks/[id]/export/route.ts` — CSV / JSON export
- `src/app/api/stats/route.ts` — dashboard analytics
- `src/app/api/sources/route.ts` — global sources registry
- `src/app/api/datasets/route.ts` — cross-task dataset explorer
- `src/components/app/{shared,sidebar,dashboard,new-task,tasks-list,task-detail,datasets,sources-view,history}.tsx`
- `src/components/theme/{theme-provider,theme-toggle}.tsx`
- `src/app/globals.css` — emerald/teal theme, dark mode, custom scrollbar + animations
- `src/app/page.tsx` — orchestrator + mobile bottom nav + sticky footer

### Current goal / verification
- ESLint passes clean. Prisma schema pushed. Dev server on :3000 returns 200s.
- Agent Browser end-to-end verification PASSED:
  - Dashboard renders (stat cards, charts, recent tasks, tag cloud, quick-start prompts)
  - New Collection → example prompt → "Generate Workflow" → AI returned a structured
    plan (title, objective, fields, search queries, source strategy, validation rules, tags)
  - "Run Collection" → async execution: web_search (8 sources) → page_reader → LLM
    extraction → cleaning/dedup → **6 structured records** with source linkage
  - Task Detail: workflow timeline (6 steps), Data tab (records w/ confidence bars +
    source favicons), Sources tab (fetch status, tokens, excerpts), Schema tab
  - Export: CSV + JSON both verified (CSV returns all fields + confidence + sourceUrl)
  - Mobile responsive (bottom nav), Dark mode toggle, sticky footer — all verified
  - No console/runtime errors after reload
- Fixed a critical extraction bug: HTML was passed raw to the LLM (noise + wrong
  truncation). Now `htmlToText()` strips scripts/styles/nav/footer/tags and the search
  snippet is included as context — extraction went from 0 → 6 records.
- Reduced Prisma log noise from `query` to `warn,error`.
- Fixed a naming-collision bug surfaced by console errors: `src/app/page.tsx` imported
  `History` from both `lucide-react` (the SVG icon) and `@/components/app/history`
  (the component). The lucide import shadowed the component, so `<History onOpenTask=…/>`
  rendered an SVG icon and React warned "Unknown event handler property onOpenTask".
  Renamed the component export to `HistoryView` and updated the import + usage. Verified
  via Agent Browser: History section renders the timeline with the prior task, zero
  console errors.
- Fixed a Data-tab layout bug reported via screenshot + VLM analysis: the records table
  used `truncate` on the title, summary, and inline field values, causing text to be
  clipped mid-word (e.g. "takeout serv", "conver…"). Redesigned the Data tab from a
  cramped table into a **card-based grid**: each record is a Card with a vertical
  confidence bar, full-wrapping title (`break-words`), `line-clamp-2` summary, and a
  2-column field grid where values wrap gracefully at word boundaries. Verified with VLM:
  "No text is truncated or cut off mid-word. All field values are fully readable.
  Layout is clean and well-aligned. No overlapping elements detected."
- Fixed the footer floating mid-content bug: the footer was overlapping data-record
  cards on tall pages because the body wrapper used `flex-1 ... min-h-0`. The `min-h-0`
  let the flex item's box get capped at the flex-allocated height while the tall data
  list overflowed beyond it, visually landing on top of the footer. Fix: removed
  `min-h-0` (and the redundant `flex flex-col` / `flex-1` on the inner content div) so
  the body grows with its content; made the footer `hidden md:block` (mobile already
  has a fixed bottom nav) and dropped the redundant `mt-auto`. Verified via DOM offsets
  (footer.offsetTop + height = page height on both tall Data-tab page 1569px and
  Dashboard 1450px) and VLM: "footer is at the very bottom, after the last record
  (Pangram), not floating between records."
- Fixed the REAL footer-floating bug (the previous fix was incomplete): root cause was a
  Radix `<ScrollArea className="max-h-[40rem]">` wrapping the data-record list. Radix
  ScrollArea applies the class to the Root, but its Viewport child uses `size-full`
  (height:100%), and since the Root's height resolves to `auto` (content-based), the
  Viewport grew to its full natural height (1216px), pushing `root.scrollHeight` to 2075
  while `root.offsetHeight` was 1569 — so 506px of invisible overflow appeared BELOW the
  footer, making the footer look "stuck in the middle" of the data list. Fix: removed the
  ScrollArea wrapper entirely on the Data tab and let the page scroll naturally (only 6
  records, no need for an inner scroll region). Verified via DOM: `rootScrollH ==
  rootOffsetH == 2144`, `footerTop(2099) + footerH(45) == rootScrollH`, `contentBelowFooter == 0`.
  VLM: "footer is positioned AFTER the last record (Pangram) at the very bottom, not
  floating or overlapping." Same ScrollArea+max-h anti-pattern still present in
  dashboard/history/sources/datasets — candidate for a follow-up sweep.
- Moved the "Total tasks / No active runs" sidebar status card from the bottom of the
  sidebar (which sat right next to the footer, making it look "connected to the footer")
  up into the `<nav>` directly under the "Workspace" nav options. Removed the bottom
  `<div className="px-4 py-4 border-t">` wrapper (the `border-t` visually tied it to the
  footer area). Now the card sits immediately after the last nav item (History), inside
  the scrollable nav, visually connected to the workspace options. Verified via DOM:
  card now at `cardTop: 493` (right under nav items) vs footer at `footerTop: 1405`,
  and `isInsideNav: true`. VLM: "The status card is located directly under the workspace
  navigation items, visually connected to the list of links above it." Also added an
  animated amber ping dot to the "active runs" indicator for liveliness.
- Made the sidebar fixed so it does not scroll with the main page. Changed the `<aside>`
  from in-flow `flex` to `fixed top-0 left-0 h-screen z-40` (always pinned to the
  viewport, independent of page scroll). Compensated for the now out-of-flow sidebar by
  adding `md:ml-64` to both the header and the body wrapper so desktop content starts at
  x=256 (after the 256px sidebar); mobile is unaffected (sidebar is `hidden md:flex`).
  Lowered the header `z-40 -> z-30` so the fixed sidebar sits above it where they'd meet.
  Verified via DOM: after scrolling the task-detail page 1228px, `asideTop` stayed at 0
  and `asideBottom` at 900 (= viewport height) — the sidebar didn't move at all while the
  main content scrolled. VLM confirmed the Intellex logo, all 6 nav items, and the Total
  tasks card all remain visible in the sidebar when scrolled. Mobile: sidebar hidden,
  header full-width (`headerLeft: 0`).
- Fixed the footer covering the sidebar's bottom: because the sidebar is now `fixed`
  (out of flow) and the footer was full-width in normal flow, the footer rendered under
  the sidebar's bottom area, hiding the "Total tasks" status card. Added `md:ml-64` to
  the footer so it starts at x=256 (after the 256px sidebar), same as the header and body.
  Verified via DOM: `footerLeft: 256`, `asideRight: 256`, `overlap: false`. VLM on
  viewport screenshot: "The 'Total tasks' card is visible at the bottom of the sidebar,
  the footer is not overlapping the sidebar."

## Phase 2: Semantic Search

### Added
- **AI-powered semantic search** for the Datasets Explorer (replaces pure substring
  matching). Uses LLM query expansion: the user's natural-language query is expanded
  into 4-8 related terms/synonyms (cached for 5 min), then each record is scored by
  weighted field matches (title=5, tag/taskTitle=3, summary=2, data field=1) + a
  small confidence tie-breaker.
- New `POST /api/search` endpoint (`src/app/api/search/route.ts`) — scans all
  completed-task records, runs `semanticSearch()` from `lib/ai.ts`, returns ranked
  hits with `score` + `matchedTerms`.
- New functions in `src/lib/ai.ts`: `expandQuery()`, `scoreRecord()`,
  `semanticSearch()`, plus `SemanticRecord` / `SemanticHit` types and an in-memory
  LLM expansion cache (5-min TTL).
- Datasets Explorer UI (`src/components/app/datasets.tsx`):
  - New **Semantic** toggle button (on by default, emerald gradient when active).
  - When semantic is on + a query is typed, calls `/api/search` (debounced 400ms),
    shows a spinner during the LLM call, then displays an "AI-expanded:" row of
    the expanded term badges + match count.
  - Results switch to a **card layout** ranked by AI relevance, each card showing
    a vertical relevance bar + score, full field values (break-words, no
    truncation), and the per-record matched terms as green badges.
  - Toggling semantic off reverts to basic substring search.
  - Removed the `ScrollArea`+`max-h` wrapper (same footer-breaking anti-pattern)
    — now natural page scroll.

### Verified
- Typed "venture capital investments in AI companies" → LLM expanded to `venture`,
  `capital`, `startup funding`, `funding` → returned ranked matches (Lovable,
  Pangram, Cursor, etc.) each with matched-term badges and relevance scores. VLM
  confirmed all 4 UI elements present: active Semantic toggle, AI-expanded row,
  ranked-by-relevance results, per-record matched terms.
- Toggling Semantic off reverts to substring search (verified "Cursor" → 1 match).
- Lint clean, zero console errors.

## Phase 3: Latest-Data Search Upgrade

### Added
- **Recency-aware semantic scoring** — records now get a `recencyScore` (exponential decay:
  0 days ago → 100, ~45-day half-life) blended into the final relevance score, so newer
  content surfaces higher even when relevance is comparable.
- **Content-date extraction** — `extractContentDate()` parses the actual data date from each
  record (looks for `date`, `published`, `funding_date`, `launch_date`, etc. fields, plus
  regex scanning of all string values for ISO / `YYYY-MM-DD` / `Mon DD, YYYY` / `DD Mon YYYY`
  patterns), falling back to the collection time. Each search hit now carries `contentDate`.
- **Date range filter** — new dropdown: Any time / Last 7d / 30d / 90d / 365d. Filters on
  the extracted content date (or collection time if no date found). Applied server-side in
  semantic mode and client-side in basic mode.
- **Sort toggle** — Relevance (default, blends relevance + recency) vs Latest (pure
  newest-content-first by `contentDate`). Visible as a segmented control.
- **Content date badge** — each record card now shows a green pill badge with the extracted
  content date (e.g. "Nov 13, 25") in the meta column.
- **Collection-time recency bias** — the workflow engine now passes `recency_days: 365` to
  `web_search` for the first two queries, and the planner prompt instructs the LLM to
  phrase at least one query emphasizing recency ("2025", "recent", "latest") and to include
  a date field whenever the request is time-sensitive. This makes new collections gather
  the latest data available till date.
- New exports in `lib/ai.ts`: `extractContentDate`, `recencyBoost`, `withinDateRange`,
  `SortMode`, `DateRange` types. `semanticSearch()` now takes an options object
  `{ limit, sort, dateRange }`.

### Verified
- Typed "funding rounds" → semantic search returned hits with extracted content dates
  (Nov 13 2025, Aug 19 2026, May 9 2022, etc.). Label: "Ranked by AI relevance + recency".
- Switched to **Latest** sort → results re-sorted newest-first: Aug 1 2027 → Nov 26 2026 →
  Nov 17 2026 → … → May 7 2024. Label: "Latest first — newest content dated till today".
- Selected **Last year** → older records (2024) filtered out, "1yr" badge shown.
- Selected **Last 30 days** → "30d" badge, only recent records shown.
- VLM confirmed: date dropdown ("Last 30 days" selected), sort toggle ("Latest" active,
  green), results sorted newest-first with content-date badges per card.
- Lint clean, zero console errors.

### Unresolved risks / next-phase recommendations
- Execution is fire-and-forget in-process; fine for dev but a job queue would be
  needed for production-grade durability.
- SQLite `tags` filtering is in-memory (acceptable at this scale).
- `page_reader` occasionally returns empty HTML for JS-heavy sites — these are marked
  failed but the run continues.
- Recommendations for next phase: per-field stats, re-extract single source, shareable
  dataset links, scheduled/recurring collections, bulk export across tasks.

---

Task ID: 3-a
Agent: scheduled-collections + activity-log backend
Task: Implemented the scheduled/recurring collections backend and the activity log + notifications API, and wired `logActivity(...)` into the existing task mutations (create / run / delete).

Work Log:
- Read the full project context (worklog, `src/lib/ai.ts`, `src/lib/api-utils.ts`, `prisma/schema.prisma`, `src/app/api/tasks/[id]/run/route.ts`) to align with existing patterns (fire-and-forget execution, `safeJsonParse`, `validateBody` + `schemas`, `rateLimit` wrapper, Next.js App Router `route.ts` style).
- Verified the SQLite DB already has the `Task.schedule` column and the `ActivityLog` table (introspected via `PRAGMA table_info` through a Prisma raw query) — no migration needed.
- Created `src/app/api/tasks/[id]/schedule/route.ts`:
  - `GET` returns the current schedule (parses the JSON string safely, returns a sensible default if absent).
  - `POST { enabled, intervalMinutes? }` validates with `schemas.schedule` (zod, min 15 min). When enabling, sets `nextRunAt = now` so the next scheduler tick picks it up; when disabling, clears `nextRunAt`. Preserves `lastRunAt` across updates. Logs `task_scheduled` activity.
- Created `src/app/api/scheduler/tick/route.ts`:
  - Single `handler` exported as both `GET` and `POST`, wrapped by `rateLimit({ max: 60, key: 'scheduler' })`.
  - Shared-secret check: `?key=` must equal `process.env.SCHEDULER_KEY || 'intellex-dev'`, else 401.
  - Queries tasks where `trashedAt IS NULL`, `status != 'running'`, and `schedule` column not null (max 200). For each, parses the schedule JSON in JS (SQLite has no native JSON query via Prisma), filters by `enabled === true` and `nextRunAt <= now`, and skips any task that is already in the in-memory `isRunning` set.
  - For each due task: advances the schedule first (`nextRunAt = now + intervalMinutes`, `lastRunAt = now`) so a duplicate tick can't double-fire it; then mirrors the `/run` route pattern — sets `status='running'`, clears prior `dataItem`/`dataSource` rows, calls `markRunning(id)`, and fires `executeWorkflow(id)` fire-and-forget with `.finally(() => markDone(id))`.
  - Returns `{ processed: N, taskIds: [...] }` immediately after queueing.
- Created `src/app/api/activity/route.ts`:
  - `GET /api/activity?limit=50&type=` — newest-first activity logs, joined with `task.title` (so deleted-task rows still surface with `taskTitle: null`). `limit` clamped to 1..200. Optional `type` filter. Each row carries an `id, taskId, taskTitle?, type, message, meta (parsed object), createdAt, timeAgo` ("3m ago" / "2h ago" / "5d ago" / "3mo ago" / "1y ago").
- Updated `src/app/api/tasks/route.ts` POST: after `db.task.create`, calls `logActivity({ type: 'task_created', taskId, message: 'Created task "..."' , meta: { title, promptSnippet, tags } })`.
- Updated `src/app/api/tasks/[id]/run/route.ts` POST: after firing `executeWorkflow`, calls `logActivity({ type: 'task_run', taskId, message: 'Started collection for "..."' , meta: { title } })`.
- Updated `src/app/api/tasks/[id]/route.ts` DELETE: now does `findUnique` first to capture the title, calls `logActivity({ type: 'task_deleted', taskId, message: 'Deleted task "..."' , meta: { title } })` BEFORE the delete (FK is ON DELETE SET NULL, so the ActivityLog row's `taskId` will be nulled on delete — keeping the title in the message preserves traceability), then deletes.
- Ran a direct-Prisma smoke test: created an ActivityLog row, read it back with the `task` join (returns `taskTitle: null` as expected for orphan rows), round-tripped a schedule JSON through `Task.schedule` and confirmed clean parse, then cleaned up. PASS.
- Ran `bun run lint` — clean (exit 0, no warnings). Verified my new/edited files produce no TypeScript errors via `bunx tsc --noEmit` (the only TS errors in the repo are in unrelated files owned by other agents / pre-existing).

Stage Summary:
- Files created:
  - `src/app/api/tasks/[id]/schedule/route.ts` — `GET`, `POST` for per-task scheduling.
  - `src/app/api/scheduler/tick/route.ts` — `GET`, `POST` (rate-limited, shared-secret gated) tick that fires due scheduled tasks.
  - `src/app/api/activity/route.ts` — `GET` recent activity log (joined with task title).
- Files modified:
  - `src/app/api/tasks/route.ts` — POST now logs `task_created`.
  - `src/app/api/tasks/[id]/run/route.ts` — POST now logs `task_run`.
  - `src/app/api/tasks/[id]/route.ts` — DELETE now logs `task_deleted` (before delete, title captured in message/meta because FK is SET NULL).
- Endpoints:
  - `GET  /api/tasks/[id]/schedule` → `{ schedule: { enabled, intervalMinutes, nextRunAt, lastRunAt } }`
  - `POST /api/tasks/[id]/schedule` `{ enabled, intervalMinutes? }` → updated schedule; logs `task_scheduled`.
  - `GET|POST /api/scheduler/tick?key=<SCHEDULER_KEY|intellex-dev>` → `{ processed, taskIds[] }`; 401 on bad key, 429 on rate-limit override.
  - `GET /api/activity?limit=50&type=` → `{ activities: [{ id, taskId, taskTitle?, type, message, meta, createdAt, timeAgo }] }`.
- Verification:
  - `bun run lint` → exit 0, clean.
  - `bunx tsc --noEmit` → no errors in any of the 6 touched/created files (only unrelated pre-existing errors remain elsewhere).
  - Direct Prisma smoke test: ActivityLog insert + read-with-join + schedule JSON round-trip all PASS; test data cleaned up.
- Notes / hand-off for the frontend agent:
  - Frontend should poll `/api/scheduler/tick?key=<key>` every ~60s (the endpoint returns immediately after queueing; safe to call repeatedly).
  - The default dev shared secret is `intellex-dev`; override with `SCHEDULER_KEY` env var in production.
  - To enable a schedule from the UI: `POST /api/tasks/[id]/schedule { enabled: true, intervalMinutes: 30 }` — the scheduler will fire the first run on the very next tick because `nextRunAt` is set to `now`.
  - `task_deleted` activity rows will have `taskId: null` (FK ON DELETE SET NULL), but the task title is preserved in `message` + `meta.title` for audit.

---

Task ID: 3-b
Agent: templates + excel export + insights backend
Task: Implemented prompt templates CRUD + idempotent built-in seeding, added xlsx
export alongside the existing CSV/JSON export, and built a platform-wide data-quality
insights endpoint.

Work Log:
- Read project context (worklog, ai.ts, api-utils.ts, prisma schema, existing export
  route, stats route) to match existing code style and patterns.
- Verified `xlsx` was NOT installed → ran `bun add xlsx` (now in package.json as
  `xlsx@0.18.5`).
- Created `src/app/api/templates/route.ts`:
  - `GET` — auto-seeds built-in templates on first call when the table is empty
    (idempotent `ensureBuiltInTemplates()` helper), then lists all templates
    ordered by `isBuiltIn desc, useCount desc, createdAt asc`. Returns
    `{ templates: [...] }`.
  - `POST` — validates `{ name, prompt, icon? }` against `schemas.template`,
    optionally accepts `fields` and `tags`, persists a user template
    (`isBuiltIn=false`), logs `template_saved` activity, returns created template.
  - Exported `ensureBuiltInTemplates()` so the seed route can reuse it.
- Created `src/app/api/templates/[id]/route.ts`:
  - `GET` — returns a single template.
  - `DELETE` — refuses built-in templates with HTTP 400, otherwise deletes.
- Created `src/app/api/templates/seed/route.ts`:
  - `POST` — idempotently seeds the 6 built-in templates if none exist; logs
    `template_saved` with `{ source: 'seed_endpoint' }` meta; returns
    `{ ok, seeded, total }`.
- Updated `src/app/api/tasks/[id]/export/route.ts`:
  - Added `?format=xlsx` branch using the `xlsx` package — builds a 3-sheet
    workbook (`Data` with schema fields + confidence/valid/sourceUrl columns,
    `Info` with task meta, `Sources` with all source URLs + fetch status) and
    returns it as a binary attachment with proper Content-Type
    `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  - Wrapped the handler in `safeApi` and logs `export` activity (type, taskId,
    message, meta `{ format, count }`) for ALL formats (previously no logging).
  - Preserved CSV and JSON behavior verbatim.
- Created `src/app/api/insights/route.ts`:
  - `GET` — platform-wide data-quality insights computed from completed tasks'
    records and sources: totalRecords, validRecords, invalidRecords,
    validityRate (1-decimal %), avgConfidence, confidenceBuckets
    (high ≥75, medium 50–74, low <50), fieldCompleteness (per-field filled/total
    + rate across all completed tasks), sourceReliability (per-host
    fetched/failed + rate, top 10), topTags (top 15).
  - Returns a zero-shaped empty payload when no completed tasks exist.
- Ran `prisma generate` after adding the new model usage (the dev server had
  cached the old client → regenerated + restarted dev server).
- Verified end-to-end against the live dev server:
  - `GET /api/templates` → 6 built-ins auto-seeded on first call, returned in
    built-in-first order.
  - `POST /api/templates/seed` → `{ok:true, seeded:0, total:6}` (idempotent).
  - `POST /api/templates` with a custom payload → created, returned with
    `isBuiltIn:false`.
  - `DELETE /api/templates/[id]` on a built-in → 400 "Built-in templates
    cannot be deleted"; on a user template → 200 `{ok:true}`.
  - `GET /api/templates/[id]` → 200 with full template.
  - `GET /api/tasks/[id]/export?format=xlsx` → 36 KB valid .xlsx
    (`Microsoft Excel 2007+` via `file`); 3 sheets confirmed (Data 33 rows,
    Info 7 rows, Sources 8 rows) by reading the file back through `XLSX.readFile`.
  - `?format=csv` and `?format=json` → unchanged, 200.
  - `GET /api/insights` → returned real numbers from the existing dataset:
    totalRecords 122, validRecords 75, invalidRecords 47, validityRate 61.5,
    avgConfidence 81.7, buckets {high:76, medium:40, low:6}, 36 fieldCompleteness
    rows, 10 sourceReliability rows, 15 topTags.
- Final `bun run lint` → clean (no errors/warnings).

Stage Summary:
- Files created:
  - `src/app/api/templates/route.ts`
  - `src/app/api/templates/[id]/route.ts`
  - `src/app/api/templates/seed/route.ts`
  - `src/app/api/insights/route.ts`
- Files modified:
  - `src/app/api/tasks/[id]/export/route.ts` (added xlsx branch + activity
    logging; preserved csv/json behavior)
  - `package.json` + `bun.lockb` (`xlsx@0.18.5` dependency added)
- Endpoints:
  - `GET    /api/templates`           — list (auto-seeds on first call)
  - `POST   /api/templates`           — create user template
  - `GET    /api/templates/[id]`      — one template
  - `DELETE /api/templates/[id]`      — delete (refuses built-in)
  - `POST   /api/templates/seed`     — idempotent re-seed
  - `GET    /api/tasks/[id]/export?format=csv|json|xlsx`
  - `GET    /api/insights`           — platform data-quality stats
- Verification: lint clean, dev server running on :3000, all routes return
  expected shapes and HTTP codes against real data.
- `xlsx` package: installed (`xlsx@0.18.5`) via `bun add xlsx` — it was NOT
  present before this task.

---

## Phase 4: Production E2E Upgrade

### Foundation
- **Prisma schema expanded**: `Task.schedule` (JSON for recurring runs), `Task.pinned`, `Task.trashedAt` (soft-delete), `Task.templateId`; new `Template`, `ActivityLog`, `Setting` models.
- **`src/lib/api-utils.ts`**: in-memory per-IP `rateLimit()`, `validateBody()` with zod, shared `schemas`, `logActivity()` helper, `safeApi()` wrapper.
- **`src/lib/ai.ts`**: `withRetry()` (exponential backoff) + `withTimeout()` applied to `web_search` (30s) and `page_reader` (45s) for resilience.
- **Error/loading/404 boundaries**: `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/loading.tsx`.
- All mutation routes now log activity (`task_created`, `task_run`, `task_deleted`).

### New backend (parallel subagents — Task IDs 3-a, 3-b)
- **Scheduled collections**: `POST /api/tasks/[id]/schedule { enabled, intervalMinutes }` + `GET /api/scheduler/tick?key=…` (fire-and-forget runner with shared-secret + rate limit). Frontend polls the tick every 60s.
- **Activity log**: `GET /api/activity?limit=&type=` — joined with task title.
- **Templates**: `GET/POST /api/templates` (auto-seeds 6 built-ins on first call), `GET/DELETE /api/templates/[id]`, `POST /api/templates/seed`. `POST /api/tasks/[id]/export` now logs `export` activity.
- **Excel export**: `?format=xlsx` added to `/api/tasks/[id]/export` using `xlsx` package (3-sheet workbook: Data + Info + Sources). CSV/JSON preserved.
- **Insights**: `GET /api/insights` — totalRecords, validityRate, avgConfidence, confidenceBuckets, fieldCompleteness, sourceReliability, topTags.
- **Preferences**: `GET/POST /api/preferences` (singleton Setting row).

### New UI
- **Command palette (⌘K)**: fuzzy-filtered navigation + actions, keyboard-navigable (↑↓↵), `src/components/app/command-palette.tsx`.
- **Keyboard shortcuts** (`src/hooks/use-keyboard-shortcuts.ts`): `g`+letter navigation (vim-style), `n` new, `,` settings, `b` activity, `p` templates, `i` insights, `?` palette, `⌘K` toggle.
- **Activity center** (Sheet): timestamped audit feed with per-type icons + task links.
- **Settings panel** (Sheet): default sort/date-range/semantic/export-format/auto-schedule/theme; persists to localStorage + DB.
- **Insights modal**: charts (confidence buckets), field-completeness bars, source-reliability bars, tag cloud.
- **Template picker** (Dialog): 6 built-in + user templates, one-click "Use template" prefills the New Collection prompt.
- **Sidebar footer toolbar**: Quick-actions (⌘K) + Templates/Insights/Activity/Settings buttons.
- **Header**: ⌘K trigger, activity bell (with unread dot), insights button.
- **Task detail**: Export dropdown now Excel/CSV/JSON; "More actions" menu with "Save as template" + "Schedule re-run…".

### Verified (Agent Browser)
- Dashboard renders clean, zero console errors.
- ⌘K palette opens, filters commands ("theme" → Toggle Theme), keyboard nav works.
- Activity center shows export/created/run entries with task links + timestamps.
- Templates picker shows 6 built-ins, "Use template" prefills prompt.
- Insights modal shows charts + field completeness + source reliability.
- Settings panel shows all preference controls.
- Task detail Export dropdown offers Excel/CSV/JSON; XLSX endpoint returns 200, 36KB valid `.xlsx` (verified via `file`).
- Scheduler tick endpoint responds; frontend polls every 60s.
- Lint clean throughout.

---

## Phase 5: Pin/Trash/Bulk Ops + Styling Polish (webDevReview round 1)

### QA assessment
- Lint clean, dev server healthy, all APIs 200. No console errors after clean reload.
- Found: `pinned` and `trashedAt` schema fields existed but had NO UI usage (dead schema).
- Found: Activity endpoint was polled every 5s (wasteful — only feeds the bell dot).
- Found (VLM): empty chart areas looked "broken/blank" rather than intentional.
- Found (VLM): hero banner was a flat block, could be more premium.

### Implemented

#### 1. Pin / Favorite tasks (uses existing `Task.pinned` field)
- `PATCH /api/tasks/[id]` with `{ pinned: boolean }` / `{ restore: boolean }` / `{ purge: boolean }`.
- Tasks list GET now sorts by `pinned desc, createdAt desc` and returns `pinned`/`trashedAt`.
- Tasks list UI: pin button per row (amber when pinned), "Pinned" section at top with header, "PINNED" badge on cards, header count "· N pinned".

#### 2. Soft-delete + Trash (uses existing `Task.trashedAt` field)
- `DELETE /api/tasks/[id]` now soft-deletes (sets `trashedAt`), not hard delete.
- New "Trash" view toggle in tasks list (Active / Trash segmented control).
- Trash view shows trashed tasks with **Restore** + **Delete forever** (purge via PATCH `{ purge: true }`).
- Empty trash state with helpful copy.

#### 3. Bulk operations
- `POST /api/tasks/bulk` with `{ ids[], action: 'delete'|'purge'|'restore'|'pin'|'unpin' }`.
- Tasks list: per-row checkbox + "Select all" + sticky bulk action bar (Pin all / Unpin / Move to trash / Restore / Delete forever / Clear).
- Selection clears on reload.

#### 4. Reduced wasteful polling
- Activity bell now polls every **30s** (was 5s). Tasks still poll 5s for running-status updates.

#### 5. Styling polish (mandatory)
- **Hero banner**: added premium mesh-gradient backdrop (3 radial gradients) + fine grid texture + stronger blur orbs + shadow. VLM: "premium, refined look… subtle depth and texture".
- **Empty chart states**: replaced blank Globe icon with an intentional chart-canvas look — subtle grid backdrop, baseline axis, faded placeholder bars, "Run a collection to populate" hint. VLM: "completely intentional rather than broken".
- Pin badge / amber accents for pinned tasks; selection ring on selected cards.

### Verified (Agent Browser)
- Pinned a task → moved to "Pinned" section, "PINNED" badge shown, header "6 tasks · 1 pinned".
- Moved a task to trash → toast "Moved to trash.", task disappeared from Active.
- Switched to Trash view → trashed task shown with Restore + Delete forever.
- Select all → bulk action bar appears with Pin all / Unpin / Move to trash / Clear.
- Dashboard hero + empty charts: VLM rated visual polish **9/10**.
- Zero console errors after clean reload; lint clean.

### Files
- Modified: `src/app/api/tasks/route.ts` (trashed filter + pinned sort + new fields), `src/app/api/tasks/[id]/route.ts` (PATCH pin/restore/purge + soft-delete DELETE), `src/components/app/tasks-list.tsx` (full rewrite: pin/trash/bulk UI), `src/components/app/shared.tsx` (TaskListItem +pinned/+trashedAt), `src/app/page.tsx` (30s activity poll), `src/components/app/dashboard.tsx` (hero mesh + empty chart states).
- Created: `src/app/api/tasks/bulk/route.ts`.

### Next-phase recommendations
- Implement a "compare two tasks" side-by-side view.
- Add 30-day auto-purge for trashed tasks (cron sweep).
- Add per-task data-quality score badge on cards.
- Pin indicator in sidebar "Total tasks" card (show pinned count).

---

## Phase 6: Quality Score + Auto-purge Trash + Pinned Indicator (webDevReview round 2)

### QA assessment
- Lint clean, dev server healthy, all APIs 200, zero console errors after reload.
- Tested dashboard, datasets (semantic + sort + date-range), task detail export
  dropdown — all working.
- Picked next-phase items from Phase 5 recommendations: per-task data-quality
  score, 30-day auto-purge for trashed tasks, pinned indicator in sidebar.

### Implemented

#### 1. Per-task data-quality score (0-100)
- `GET /api/tasks` now computes a `qualityScore` per task:
  `validityRate*50 + sourceCoverage*25 + (1-dupPenalty)*25` (only for completed
  tasks with items; 0 otherwise).
- New reusable `<QualityBadge score={n} />` in `shared.tsx` — pill with gauge
  icon, score number, and a color-coded mini progress bar (green ≥80, amber
  ≥60, red <60).
- Tasks list shows the badge on every completed task card next to the status.

#### 2. 30-day auto-purge for trashed tasks
- New `POST/GET /api/scheduler/purge-trash?key=...` endpoint (shared-secret +
  rate-limited). Hard-deletes tasks whose `trashedAt` is older than 30 days,
  logs `task_deleted` with `{ autoPurged: true }` for each.
- Frontend (`page.tsx`) calls purge-trash every ~5 min (every 5th scheduler
  tick) — idempotent + cheap.
- Verified: returns `{ ok, purged: 0, message: "No stale trash." }` on empty;
  returns `401` on wrong key.

#### 3. Pinned indicator in sidebar "Total tasks" card
- `Sidebar` now accepts `pinnedCount` prop; `page.tsx` computes it from the
  tasks list and passes it down.
- The Total tasks card shows a small amber pin pill with the count next to the
  total (only when pinnedCount > 0).

### Verified (Agent Browser + VLM)
- Quality badge on all 5 completed task cards with scores 100/67/50 etc.,
  color-coded (green/amber/red) with mini progress bars. VLM confirmed.
- Sidebar Total tasks card shows amber pin badge "1" next to "5". VLM confirmed.
- Purge-trash endpoint: 200 with `{purged:0}` on clean trash, 401 on bad key.
- Zero console errors; lint clean.

### Files
- Modified: `src/app/api/tasks/route.ts` (qualityScore computation),
  `src/components/app/shared.tsx` (TaskListItem +qualityScore, new QualityBadge),
  `src/components/app/tasks-list.tsx` (QualityBadge on cards),
  `src/components/app/sidebar.tsx` (pinnedCount prop + amber pin pill),
  `src/app/page.tsx` (pinnedCount state + pass-through + purge-trash polling).
- Created: `src/app/api/scheduler/purge-trash/route.ts`.

### Next-phase recommendations
- "Compare two tasks" side-by-side view.
- Sort tasks by quality score (in addition to pinned/created).
- Quality-score trend over time in Insights modal.
- Show pinned count on Dashboard hero stat too.

---

## Phase 7: Compare Tasks + Sort by Quality (webDevReview round 3)

### QA assessment
- Lint clean, dev server healthy, zero console errors.
- Tested Dashboard, Sources (48 sources traced), History (timeline with Sep 24 entries) — all stable.
- Picked next-phase items: "Compare two tasks" side-by-side view + "Sort tasks by quality score".

### Implemented

#### 1. Compare Tasks side-by-side view
- New `GET /api/tasks/compare?a=<id>&b=<id>` endpoint — returns both tasks' summarized
  metrics (items, valid, invalid, sources, uniqueHosts, duplicates, tokens, validityRate,
  dupRate, sourceCoverage, qualityScore), shared fields, shared tags, and per-metric
  winners (`a | b | tie`).
- New `<CompareModal>` component (`src/components/app/compare-modal.tsx`):
  - Two task pickers (Task A emerald / Task B sky) filtered to completed tasks.
  - Title row with colored summary cards.
  - Metrics comparison table with trophy icons + colored values for winners; lower-is-better
    for "Tokens used".
  - Quality bars (A emerald / B sky) with High/Medium/Low labels.
  - Overlap section showing shared fields (mono badges) + shared tags (violet badges).
  - Verdict section: counts wins and declares a winner with quality score.
- Wired into `page.tsx`: listens for `intellex:open-compare` event, passes `allTasks`.
- "Compare" button added to the Tasks list header (next to New Collection).

#### 2. Sort tasks by quality / records / recent
- Tasks list now has a sort dropdown: Default / Quality score / Most records / Most recent.
- Client-side sort applied to both pinned and unpinned sections.

### Verified (Agent Browser + VLM)
- Opened Compare modal → picked Bangalore (A) vs bestselling headphones (B):
  - Metrics table rendered all 9 rows (Records, Valid, Validity rate, Sources, Unique
    domains, Duplicates, Dup rate, Tokens, Quality score).
  - Winners highlighted with trophy + green text (A won 5/5).
  - Verdict: "Task A (Bangalore Startups Collection) leads in 5 of 5 differentiated
    metrics, with a quality score of 100/100."
  - Quality bars: A=100/100 green "High", B=50/100 red "Low".
  - Overlap section showed shared fields + tags.
- VLM rated Compare modal visual polish **9/10**.
- Sort by "Quality score" → Bangalore (100) first, then Asia AI Conferences (67).
- Zero console errors; lint clean.

### Files
- Created: `src/app/api/tasks/compare/route.ts`, `src/components/app/compare-modal.tsx`.
- Modified: `src/app/page.tsx` (compareOpen state + allTasks + event listener + modal),
  `src/components/app/tasks-list.tsx` (Compare button + sort dropdown + sortFn).

### Next-phase recommendations
- Quality-score trend over time in Insights modal (sparkline per day).
- Show pinned count on Dashboard hero stat too.
- Add "Compare" action to command palette.
- Export the comparison as a PDF/image.

---

## Phase 8: Quality Trend Sparkline + Compare/Templates/Insights in Command Palette + Dashboard Pinned Count (webDevReview round 4)

### QA assessment
- Lint clean, dev server healthy, zero console errors (only pre-existing a11y
  warnings about DialogContent aria-describedby — cosmetic, non-blocking).
- Dashboard, Sources, History all stable.
- Picked three next-phase items from Phase 7 recommendations.

### Implemented

#### 1. Quality-score trend sparkline in Insights modal
- `GET /api/insights` now returns `qualityTrend`: per-day average quality score
  over the last 14 days (computes the same validity×50 + sourceCoverage×25 +
  (1-dup)×25 formula per task, averaged per day, with task count).
- Insights modal now has a "Quality-score trend" section with an emerald AreaChart
  (gradient fill, 0-100 Y-axis, date X-axis, dots, tooltip showing score + task count).
  Empty-state message when no completed tasks in the window.
- Verified: real data shows peaks on 09-22 (96), 09-23, 09-25. VLM confirmed chart
  rendered with visible line/area + axis labels.

#### 2. Compare / Insights / Templates in Command Palette (⌘K)
- `<CommandPalette>` now accepts `onOpenCompare`, `onOpenInsights`,
  `onOpenTemplates` optional props and adds three new Actions:
  - "Compare Tasks" (GitCompare icon, keywords: diff, vs, side-by-side)
  - "Open Data Quality Insights" (TrendingUp icon, keywords: stats, quality, chart)
  - "Open Prompt Templates" (FileText icon, keywords: presets, saved)
- Wired in `page.tsx`: all three open their respective modals.
- Verified: ⌘K → all 6 action commands visible (Compare, Insights, Templates,
  Settings, Activity, Toggle Theme); clicking "Compare Tasks" opens the Compare modal.

#### 3. Pinned count on Dashboard hero stat
- `GET /api/stats` now returns `pinnedTasks` count (excludes trashed) and the
  recent-tasks query now filters out trashed + sorts pinned-first.
- Dashboard "Total Tasks" stat card sub-text now shows "N planned · M pinned"
  when there are pinned tasks.
- Verified: card shows "0 planned · 1 pinned".

### Files
- Modified: `src/app/api/insights/route.ts` (qualityTrend + createdAt select),
  `src/components/app/insights-modal.tsx` (AreaChart trend section + type),
  `src/components/app/command-palette.tsx` (3 new action commands + props + imports),
  `src/app/page.tsx` (pass onOpenCompare/Insights/Templates to palette),
  `src/app/api/stats/route.ts` (pinnedTasks + trashed filtering + pinned-first sort),
  `src/components/app/dashboard.tsx` (pinned count in Total Tasks sub),
  `src/components/app/shared.tsx` (DashboardStats.counts.pinnedTasks?).

### Verified
- Insights sparkline: VLM confirmed rendered with green area, 0-100 axis, date axis,
  data peaks on 09-22/23/25.
- Command palette: all 6 action commands present; "Compare Tasks" opens modal.
- Dashboard: "Total Tasks" card shows "0 planned · 1 pinned".
- Zero console errors (only pre-existing a11y warnings); lint clean.

### Next-phase recommendations
- Export the comparison as a PDF/image.
- Add a "Recently used templates" quick-pick row.
- Show quality trend per-task (mini sparkline on task cards).
- Add keyboard shortcut cheat-sheet modal (? could open a help dialog).
