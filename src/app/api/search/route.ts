import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, schemas, validateBody } from '@/lib/api-utils'
import { semanticSearch, type SemanticRecord, type SortMode, type DateRange } from '@/lib/ai'

function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

const VALID_SORTS: SortMode[] = ['relevance', 'latest']
const VALID_RANGES: DateRange[] = ['any', '7d', '30d', '90d', '365d']

// POST /api/search  { q: string, limit?: number, sort?: 'relevance'|'latest', dateRange?: 'any'|'7d'|'30d'|'90d'|'365d' }
// Semantic search across all completed-task records using LLM query expansion + relevance scoring.
export const POST = rateLimit({ max: 60, key: 'search' })(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({} as any))
  const parsed = validateBody(schemas.search, body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const q = parsed.data.q.trim()
  const limit = parsed.data.limit
  const sort: SortMode = parsed.data.sort
  const dateRange: DateRange = parsed.data.dateRange

  // Fetch all completed-task records
  const tasks = await db.task.findMany({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
    include: { dataItems: { orderBy: { createdAt: 'asc' } } },
  })

  const records: SemanticRecord[] = []
  for (const t of tasks) {
    const tags = Array.isArray(safeObj(t.tags)) ? safeObj(t.tags) : []
    for (const it of t.dataItems) {
      records.push({
        id: it.id,
        taskId: t.id,
        taskTitle: t.title,
        title: it.title,
        summary: it.summary,
        data: safeObj(it.data),
        tags,
        confidence: it.confidence,
        valid: it.valid,
        createdAt: it.createdAt.toISOString(),
      })
    }
  }

  if (records.length === 0) {
    return NextResponse.json({ hits: [], expandedTerms: [], total: 0, message: 'No records to search yet.' })
  }

  const hits = await semanticSearch(records, q, { limit, sort, dateRange })

  return NextResponse.json({
    query: q,
    sort,
    dateRange,
    total: hits.length,
    scanned: records.length,
    hits,
  })
})
