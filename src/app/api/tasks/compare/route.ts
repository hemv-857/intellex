import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function safeArr(s?: string | null): any[] {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
}
function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

// GET /api/tasks/compare?a=<id>&b=<id>
// Returns a side-by-side comparison payload for two tasks.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const aId = searchParams.get('a')
  const bId = searchParams.get('b')
  if (!aId || !bId) return NextResponse.json({ error: 'Both a and b task ids are required' }, { status: 400 })
  if (aId === bId) return NextResponse.json({ error: 'Pick two different tasks to compare' }, { status: 400 })

  const [a, b] = await Promise.all([
    db.task.findUnique({
      where: { id: aId },
      include: { _count: { select: { dataItems: true, sources: true } }, sources: { select: { hostName: true }, take: 200 } },
    }),
    db.task.findUnique({
      where: { id: bId },
      include: { _count: { select: { dataItems: true, sources: true } }, sources: { select: { hostName: true }, take: 200 } },
    }),
  ])
  if (!a || !b) return NextResponse.json({ error: 'One or both tasks not found' }, { status: 404 })

  const summarize = (t: any) => {
    const stats = safeObj(t.stats)
    const items = Number(stats.items ?? t._count?.dataItems ?? 0) || 0
    const valid = Number(stats.valid ?? 0) || 0
    const sources = Number(stats.sources ?? t._count?.sources ?? 0) || 0
    const dups = Number(stats.duplicates ?? 0) || 0
    const tokens = Number(stats.tokens ?? 0) || 0
    const validityRate = items > 0 ? Math.round((valid / items) * 100) : 0
    const dupRate = items > 0 ? Math.round((dups / items) * 100) : 0
    const sourceCoverage = Math.min(100, Math.round((sources / 8) * 100))
    const qualityScore = items > 0
      ? Math.round((validityRate / 100) * 50 + (sourceCoverage / 100) * 25 + ((100 - dupRate) / 100) * 25)
      : 0
    // unique hosts
    const hosts = new Set<string>()
    for (const s of t.sources || []) {
      if (s.hostName) hosts.add(s.hostName)
    }
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      objective: t.objective,
      tags: safeArr(t.tags),
      fields: safeArr(t.fields).map((f: any) => f?.name).filter(Boolean),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      metrics: {
        items,
        valid,
        invalid: items - valid,
        sources,
        uniqueHosts: hosts.size,
        duplicates: dups,
        tokens,
        validityRate,
        dupRate,
        sourceCoverage,
        qualityScore,
      },
    }
  }

  const taskA = summarize(a)
  const taskB = summarize(b)

  // Shared field names + shared hosts for "overlap" indicators
  const fieldsA = new Set(taskA.fields)
  const fieldsB = new Set(taskB.fields)
  const sharedFields = [...fieldsA].filter((f) => fieldsB.has(f))
  const tagsA = new Set(taskA.tags)
  const tagsB = new Set(taskB.tags)
  const sharedTags = [...tagsA].filter((t) => tagsB.has(t))

  // Winner per metric (for highlighting in the UI)
  const winners = {
    items: taskA.metrics.items > taskB.metrics.items ? 'a' : taskA.metrics.items < taskB.metrics.items ? 'b' : 'tie',
    valid: taskA.metrics.valid > taskB.metrics.valid ? 'a' : taskA.metrics.valid < taskB.metrics.valid ? 'b' : 'tie',
    validityRate: taskA.metrics.validityRate > taskB.metrics.validityRate ? 'a' : taskA.metrics.validityRate < taskB.metrics.validityRate ? 'b' : 'tie',
    sources: taskA.metrics.sources > taskB.metrics.sources ? 'a' : taskA.metrics.sources < taskB.metrics.sources ? 'b' : 'tie',
    qualityScore: taskA.metrics.qualityScore > taskB.metrics.qualityScore ? 'a' : taskA.metrics.qualityScore < taskB.metrics.qualityScore ? 'b' : 'tie',
    tokens: taskA.metrics.tokens < taskB.metrics.tokens ? 'a' : taskA.metrics.tokens > taskB.metrics.tokens ? 'b' : 'tie', // fewer tokens = better efficiency
  }

  return NextResponse.json({
    a: taskA,
    b: taskB,
    sharedFields,
    sharedTags,
    winners,
  })
}
