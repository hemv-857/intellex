import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, schemas, validateBody } from '@/lib/api-utils'
import { searchRecords } from '@/lib/search'
import { db } from '@/lib/db'
import { recencyBoost, type SemanticRecord } from '@/lib/ai'

function safeObj(s?: string | null): any {
  if (!s) return {}
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

// POST /api/search  { q, limit?, sort?, dateRange?, semantic? }
// Matching runs in SQLite (FTS5, see lib/search.ts) and the LLM is only consulted
// to widen the query when the literal query finds nothing. This route previously
// loaded every record of every completed task into memory on each call.
export const POST = rateLimit({ max: 60, key: 'search' })(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({} as any))
  const parsed = validateBody(schemas.search, body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const q = parsed.data.q.trim()
  const limit = parsed.data.limit
  const sort = parsed.data.sort
  const dateRange = parsed.data.dateRange
  // `semantic: false` skips the LLM expansion entirely — one less billed call.
  const semantic = (body as any).semantic !== false

  const { hits: ids, expandedTerms, searched } = await searchRecords({
    query: q,
    limit,
    mode: sort,
    dateRange,
    useSemantic: semantic,
  })

  if (ids.length === 0) {
    return NextResponse.json({
      query: q,
      sort,
      dateRange,
      total: 0,
      scanned: 0,
      searched,
      expandedTerms,
      hits: [],
    })
  }

  // Only the matched rows are ever loaded.
  const rows = await db.dataItem.findMany({
    where: { id: { in: ids.map((h) => h.id) } },
    include: { task: { select: { id: true, title: true, tags: true } } },
  })

  const rankById = new Map(ids.map((h) => [h.id, h]))
  const terms = expandedTerms.length ? expandedTerms : q.split(/\s+/)
  const hits = rows
    .map((r): SemanticRecord & { score: number; recencyScore: number; matchedTerms: string[]; contentDate: string | null } => {
      const tags = Array.isArray(safeObj(r.task.tags)) ? safeObj(r.task.tags) : []
      const haystack = `${r.title ?? ''} ${r.summary ?? ''} ${r.data} ${r.task.title} ${tags.join(' ')}`.toLowerCase()
      const matchedTerms = terms.filter((t) => {
        const token = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
        return token.length >= 2 && haystack.includes(token)
      })

      const record: SemanticRecord = {
        id: r.id,
        taskId: r.taskId,
        taskTitle: r.task.title,
        title: r.title,
        summary: r.summary,
        data: safeObj(r.data),
        tags,
        confidence: r.confidence,
        valid: r.valid,
        createdAt: r.createdAt.toISOString(),
      }

      return {
        ...record,
        score: rankById.get(r.id)?.score ?? 0,
        recencyScore: recencyBoost(r.contentDate?.toISOString() ?? null, record.createdAt),
        matchedTerms,
        contentDate: r.contentDate?.toISOString() ?? null,
      }
    })
    .sort((a, b) => (sort === 'latest' ? b.recencyScore - a.recencyScore || b.score - a.score : b.score - a.score))

  return NextResponse.json({
    query: q,
    sort,
    dateRange,
    total: hits.length,
    scanned: rows.length,
    searched,
    expandedTerms,
    hits,
  })
})