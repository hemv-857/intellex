import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}
function safeArr(s?: string | null): any[] {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
}

// GET /api/stats -> dashboard overview
export async function GET() {
  const [totalTasks, runningTasks, completedTasks, failedTasks, plannedTasks, pinnedTasks] = await Promise.all([
    db.task.count({ where: { trashedAt: null } }),
    db.task.count({ where: { status: 'running', trashedAt: null } }),
    db.task.count({ where: { status: 'completed', trashedAt: null } }),
    db.task.count({ where: { status: 'failed', trashedAt: null } }),
    db.task.count({ where: { status: 'planned', trashedAt: null } }),
    db.task.count({ where: { pinned: true, trashedAt: null } }),
  ])

  const totalItems = await db.dataItem.count()
  const totalSources = await db.dataSource.count()
  const validItems = await db.dataItem.count({ where: { valid: true } })

  // recent tasks (exclude trashed)
  const recent = await db.task.findMany({
    where: { trashedAt: null },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 6,
    include: { _count: { select: { dataItems: true, sources: true } } },
  })

  // status over time (last 14 days, grouped by day)
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const recentByDay = await db.task.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true, createdAt: true },
  })
  const dayMap = new Map<string, { date: string; planned: number; completed: number; failed: number; running: number }>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    dayMap.set(key, { date: key, planned: 0, completed: 0, failed: 0, running: 0 })
  }
  for (const t of recentByDay) {
    const key = t.createdAt.toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (bucket && t.status in bucket) (bucket as any)[t.status]++
  }

  // top source domains
  const allSources = await db.dataSource.findMany({ select: { hostName: true } })
  const domainCounts = new Map<string, number>()
  for (const s of allSources) {
    if (!s.hostName) continue
    domainCounts.set(s.hostName, (domainCounts.get(s.hostName) || 0) + 1)
  }
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([host, count]) => ({ host, count }))

  // tokens
  const tasks = await db.task.findMany({ select: { stats: true } })
  let tokens = 0
  for (const t of tasks) {
    const st = safeObj(t.stats)
    if (typeof st.tokens === 'number') tokens += st.tokens
  }

  // tag distribution
  const tagMap = new Map<string, number>()
  for (const t of tasks) {
    // need tags - fetch separately below
  }
  const allTags = await db.task.findMany({ select: { tags: true } })
  for (const t of allTags) {
    for (const tag of safeArr(t.tags)) {
      const tg = String(tag)
      tagMap.set(tg, (tagMap.get(tg) || 0) + 1)
    }
  }
  const tagDist = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, count]) => ({ tag, count }))

  return NextResponse.json({
    counts: { totalTasks, runningTasks, completedTasks, failedTasks, plannedTasks, pinnedTasks, totalItems, totalSources, validItems, tokens },
    recent: recent.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      tags: safeArr(t.tags),
      stats: safeObj(t.stats),
      itemCount: (t as any)._count?.dataItems ?? 0,
      sourceCount: (t as any)._count?.sources ?? 0,
      createdAt: t.createdAt,
    })),
    timeseries: [...dayMap.values()],
    topDomains,
    tagDist,
  })
}
