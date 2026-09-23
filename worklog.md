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

### Unresolved risks / next-phase recommendations
- Execution is fire-and-forget in-process; fine for dev but a job queue would be
  needed for production-grade durability.
- SQLite `tags` filtering is in-memory (acceptable at this scale).
- `page_reader` occasionally returns empty HTML for JS-heavy sites — these are marked
  failed but the run continues.
- Recommendations for next phase: per-field stats, re-extract single source, shareable
  dataset links, scheduled/recurring collections, bulk export across tasks.
