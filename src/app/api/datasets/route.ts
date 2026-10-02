import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { DATASETS_PAGE_SIZE } from '@/lib/limits'
import { visibleCompleted } from '@/lib/visibility'

function safeObj(s?: string | null): any {
  if (!s) return {}
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

// GET /api/datasets?q=&tag=&offset=&limit=
//
// This used to load every completed task with all of its records, filter in JS,
// then slice to the first 1000 — so the cap never saved any memory. Filtering,
// counting and paging all happen in SQL now; only one page of rows is loaded.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const tag = searchParams.get('tag') || undefined
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || DATASETS_PAGE_SIZE, 1), 500)

  // A plain-text search reuses the FTS index rather than scanning in JS.
  const usesFts = q.length > 0
  const matchExpr = usesFts ? buildSimpleMatch(q) : null

  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT d.id            AS id,
           d.taskId        AS taskId,
           t.title         AS taskTitle,
           d.title         AS title,
           d.summary       AS summary,
           d.data          AS data,
           d.confidence    AS confidence,
           d.valid         AS valid,
           d.createdAt     AS createdAt,
           t.tags          AS tags,
           t.fields        AS fields
    FROM DataItem d
    JOIN Task t ON t.id = d.taskId
    WHERE t.status = 'completed'
      AND t.trashedAt IS NULL
      AND (${matchExpr} IS NULL OR d.id IN (
             SELECT itemId FROM DataItemFts WHERE DataItemFts MATCH ${matchExpr ?? ''}
           ))
      AND (${tag ?? null} IS NULL OR EXISTS (
             SELECT 1 FROM json_each(COALESCE(t.tags, '[]')) je
             WHERE je.value = ${tag ?? null}
           ))
    ORDER BY d.createdAt DESC, d.id
    LIMIT ${limit} OFFSET ${offset}
  `)

  const countRows = await db.$queryRaw<{ total: number }[]>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM DataItem d
    JOIN Task t ON t.id = d.taskId
    WHERE t.status = 'completed'
      AND t.trashedAt IS NULL
      AND (${matchExpr} IS NULL OR d.id IN (
             SELECT itemId FROM DataItemFts WHERE DataItemFts MATCH ${matchExpr ?? ''}
           ))
      AND (${tag ?? null} IS NULL OR EXISTS (
             SELECT 1 FROM json_each(COALESCE(t.tags, '[]')) je
             WHERE je.value = ${tag ?? null}
           ))
  `)

  // Task metadata for the filter dropdown — small and bounded by task count.
  const tasks = await db.task.findMany({
    where: visibleCompleted,
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, status: true, tags: true, stats: true, fields: true, updatedAt: true },
  })

  const totalRecords = Number(countRows[0]?.total ?? 0)

  return NextResponse.json({
    count: totalRecords,
    returned: rows.length,
    truncated: offset + rows.length < totalRecords,
    offset,
    limit,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      tags: safeObj(t.tags),
      stats: safeObj(t.stats),
      fields: safeObj(t.fields),
      updatedAt: t.updatedAt,
    })),
    records: rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      title: r.title,
      summary: r.summary,
      confidence: Number(r.confidence),
      valid: !!r.valid,
      data: safeObj(r.data),
      tags: Array.isArray(safeObj(r.tags)) ? safeObj(r.tags) : [],
      fields: safeObj(r.fields),
      createdAt: r.createdAt,
    })),
  })
}

// Datasets uses a plain substring-ish box, so tokens are ORed rather than
// phrase-matched. Reuses the same sanitizer as the search route.
function buildSimpleMatch(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.slice(0, 40))
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return null
  const seen = new Set<string>()
  const quoted: string[] = []
  for (const t of tokens) {
    if (seen.has(t)) continue
    seen.add(t)
    quoted.push(`"${t}"`)
    if (seen.size >= 12) break
  }
  return quoted.length ? quoted.join(' OR ') : null
}