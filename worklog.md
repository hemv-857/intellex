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

### Unresolved risks / next-phase recommendations
- Execution is fire-and-forget in-process; fine for dev but a job queue would be
  needed for production-grade durability.
- SQLite `tags` filtering is in-memory (acceptable at this scale).
- `page_reader` occasionally returns empty HTML for JS-heavy sites — these are marked
  failed but the run continues.
- Recommendations for next phase: per-field stats, re-extract single source, shareable
  dataset links, scheduled/recurring collections, bulk export across tasks.
