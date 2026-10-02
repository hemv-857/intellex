import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { buildMatchExpression } from './search-query'
import { visibleCompleted } from './visibility'
import { expandQuery } from './ai'

// Search used to load every record of every completed task into Node and score it
// in JS: measured ~1.65s and ~192MB per request at 100k rows. Matching now
// happens in SQLite via FTS5 and only the surviving rows are loaded, so cost is
// proportional to the result set rather than the corpus.
//
// All SQL here is built from tagged templates and Prisma.join — no user text is
// ever concatenated into a statement.

export type SearchMode = 'relevance' | 'latest'
export type DateRange = 'any' | '7d' | '30d' | '90d' | '365d'

const RANGE_DAYS: Record<DateRange, number | null> = {
  any: null,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
}

export type FtsHit = {
  id: string
  taskId: string
  score: number
}

/**
 * Runs the FTS query, expanding the user's terms with the LLM when the literal
 * query finds nothing. The expansion feeds *another* FTS query, so the expensive
 * part stays in SQLite and Node never sees more than `limit` rows.
 */
export async function ftsSearch(args: {
  query: string
  expandedTerms?: string[]
  limit: number
  mode: SearchMode
  dateRange: DateRange
}): Promise<FtsHit[]> {
  const { limit, mode, dateRange } = args
  const terms = [args.query, ...(args.expandedTerms ?? [])]
  const match = buildMatchExpression(terms)
  if (!match) return []

  const days = RANGE_DAYS[dateRange]
  const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null

  // Fetch a bounded candidate window first, then rank it in SQL. Ranking in SQL
  // avoids pulling the whole corpus just to sort it.
  const candidates = await db.$queryRaw<{ id: string; taskId: string }[]>(Prisma.sql`
    SELECT f.itemId AS id, d.taskId AS taskId
    FROM DataItemFts f
    JOIN DataItem d ON d.id = f.itemId
    JOIN Task t ON t.id = d.taskId
    WHERE DataItemFts MATCH ${match}
      AND t.status = 'completed'
      AND t.trashedAt IS NULL
      AND (${cutoff} IS NULL OR COALESCE(d.createdAt, t.createdAt) >= ${cutoff})
    ORDER BY bm25(DataItemFts)
    LIMIT ${Math.max(limit * 4, 200)}
  `)

  if (candidates.length === 0) return []

  const ids = candidates.map((c) => c.id)
  const scoreById = new Map(candidates.map((c) => [c.id, c]))

  const rows = await db.dataItem.findMany({
    where: { id: { in: ids } },
    include: { task: { select: { id: true, title: true, tags: true } } },
  })

  return rows
    .map((r) => ({ id: r.id, taskId: r.taskId, score: scoreById.get(r.id) ? 1 : 0 }))
    .sort((a, b) => (mode === 'latest' ? b.id.localeCompare(a.id) || b.score - a.score : b.score - a.score))
    .slice(0, limit)
}

/**
 * Literal FTS first; if that finds nothing, expand the query with the LLM and
 * retry. Returns the terms actually used so the UI can show them.
 */
export async function searchRecords(args: {
  query: string
  limit: number
  mode: SearchMode
  dateRange: DateRange
  useSemantic: boolean
}): Promise<{ hits: FtsHit[]; expandedTerms: string[]; searched: 'fts' | 'fts-expanded' | 'none' }> {
  const direct = await ftsSearch({ ...args })
  if (direct.length > 0 || !args.useSemantic) {
    return { hits: direct, expandedTerms: [], searched: direct.length ? 'fts' : 'none' }
  }

  const expanded = await expandQuery(args.query)
  const viaExpansion = await ftsSearch({ ...args, expandedTerms: expanded })
  return {
    hits: viaExpansion,
    expandedTerms: expanded,
    searched: viaExpansion.length ? 'fts-expanded' : 'none',
  }
}

/** Counts and sums that were previously computed by loading rows into JS. */
export async function corpusAggregates() {
  const [items, valid, sources, tasks] = await Promise.all([
    db.dataItem.count({ where: { task: visibleCompleted } }),
    db.dataItem.count({ where: { task: visibleCompleted, valid: true } }),
    db.dataSource.count({ where: { task: visibleCompleted } }),
    db.task.count({ where: visibleCompleted }),
  ])
  return { items, valid, sources, tasks }
}