import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { semanticSearch, type SemanticRecord, type SortMode, type DateRange } from '@/lib/ai'

function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

const VALID_SORTS: SortMode[] = ['relevance', 'latest']
const VALID_RANGES: DateRange[] = ['any', '7d', '30d', '90d', '365d']

// POST /api/search  { q: string, limit?: number, sort?: 'relevance'|'latest', dateRange?: 'any'|'7d'|'30d'|'90d'|'365d' }
// Semantic search across all completed-task records using LLM query expansion + relevance scoring.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const q = String(body?.q || '').trim()
  const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 500)
  const sort: SortMode = VALID_SORTS.includes(body?.sort) ? body.sort : 'relevance'
  const dateRange: DateRange = VALID_RANGES.includes(body?.dateRange) ? body.dateRange : 'any'

  if (!q) {
    return NextResponse.json({ error: 'Query (q) is required' }, { status: 400 })
  }

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
}
