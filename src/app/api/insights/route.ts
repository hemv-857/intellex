import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeApi } from '@/lib/api-utils'

function safeArr(s?: string | null): any[] {
  if (!s) return []
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}
function safeObj(s?: string | null): any {
  if (!s) return {}
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

// GET /api/insights -> platform-wide data-quality insights
export function GET() {
  return safeApi(async () => {
    // Pull all completed-task data items + their task's field schema + source URL.
    const tasks = await db.task.findMany({
      where: { status: 'completed' },
      select: { id: true, fields: true, tags: true, stats: true, createdAt: true },
    })
    const taskIdSet = new Set(tasks.map((t) => t.id))
    if (taskIdSet.size === 0) {
      return NextResponse.json(emptyInsights())
    }

    const [items, sources] = await Promise.all([
      db.dataItem.findMany({
        where: { taskId: { in: [...taskIdSet] } },
        select: {
          id: true,
          taskId: true,
          data: true,
          confidence: true,
          valid: true,
          sourceId: true,
        },
      }),
      db.dataSource.findMany({
        where: { taskId: { in: [...taskIdSet] } },
        select: { id: true, hostName: true, fetchStatus: true, taskId: true },
      }),
    ])

    const totalRecords = items.length
    const validRecords = items.filter((i) => i.valid).length
    const invalidRecords = totalRecords - validRecords
    const validityRate = totalRecords > 0 ? Math.round((validRecords / totalRecords) * 1000) / 10 : 0

    // Average confidence + buckets
    let sumConf = 0
    let high = 0
    let med = 0
    let low = 0
    for (const it of items) {
      const c = it.confidence || 0
      sumConf += c
      if (c >= 75) high++
      else if (c >= 50) med++
      else low++
    }
    const avgConfidence = totalRecords > 0 ? Math.round((sumConf / totalRecords) * 10) / 10 : 0

    // Field completeness across all completed tasks.
    // Build a set of all field names across completed tasks (declared in schema).
    const fieldSet = new Set<string>()
    const taskFieldMap = new Map<string, string[]>()
    for (const t of tasks) {
      const names = safeArr(t.fields).map((f: any) => String(f?.name)).filter(Boolean)
      taskFieldMap.set(t.id, names)
      for (const n of names) fieldSet.add(n)
    }
    // Count per-field: how many records have a non-empty value vs the total.
    const fieldStats = new Map<string, { filled: number; total: number }>()
    for (const f of fieldSet) fieldStats.set(f, { filled: 0, total: 0 })

    for (const it of items) {
      const data = safeObj(it.data)
      const taskFields = taskFieldMap.get(it.taskId) || []
      for (const f of taskFields) {
        const st = fieldStats.get(f)
        if (!st) continue
        st.total++
        const v = data[f]
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          st.filled++
        }
      }
    }
    const fieldCompleteness = [...fieldStats.entries()]
      .map(([field, s]) => ({
        field,
        filled: s.filled,
        total: s.total,
        rate: s.total > 0 ? Math.round((s.filled / s.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total || a.field.localeCompare(b.field))

    // Source reliability per host (top 10 hosts)
    const hostMap = new Map<string, { fetched: number; failed: number }>()
    for (const s of sources) {
      const host = s.hostName || '(unknown)'
      const cur = hostMap.get(host) || { fetched: 0, failed: 0 }
      if (s.fetchStatus === 'fetched') cur.fetched++
      else if (s.fetchStatus === 'failed') cur.failed++
      hostMap.set(host, cur)
    }
    const sourceReliability = [...hostMap.entries()]
      .map(([hostName, v]) => {
        const total = v.fetched + v.failed
        return {
          hostName,
          fetched: v.fetched,
          failed: v.failed,
          rate: total > 0 ? Math.round((v.fetched / total) * 1000) / 10 : 0,
        }
      })
      .sort((a, b) => b.fetched + b.failed - (a.fetched + a.failed))
      .slice(0, 10)

    // Top tags across completed tasks
    const tagMap = new Map<string, number>()
    for (const t of tasks) {
      for (const tag of safeArr(t.tags)) {
        const tg = String(tag)
        if (!tg) continue
        tagMap.set(tg, (tagMap.get(tg) || 0) + 1)
      }
    }
    const topTags = [...tagMap.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)

    // Quality-score trend over the last 14 days (per-day average quality of tasks completed that day)
    const dayBuckets = new Map<string, { sum: number; count: number }>()
    const today = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      dayBuckets.set(key, { sum: 0, count: 0 })
    }
    for (const t of tasks) {
      const key = t.createdAt.toISOString().slice(0, 10)
      const bucket = dayBuckets.get(key)
      if (!bucket) continue
      const stats = safeObj(t.stats)
      const items = Number(stats.items ?? 0) || 0
      const valid = Number(stats.valid ?? 0) || 0
      const sources = Number(stats.sources ?? 0) || 0
      const dups = Number(stats.duplicates ?? 0) || 0
      if (items > 0) {
        const validityRate = valid / items
        const dupPenalty = Math.min(1, dups / items)
        const sourceCoverage = Math.min(1, sources / 8)
        const score = Math.round(validityRate * 50 + sourceCoverage * 25 + (1 - dupPenalty) * 25)
        bucket.sum += score
        bucket.count++
      }
    }
    const qualityTrend = [...dayBuckets.entries()].map(([date, b]) => ({
      date,
      avgScore: b.count > 0 ? Math.round(b.sum / b.count) : 0,
      tasks: b.count,
    }))

    return NextResponse.json({
      totalRecords,
      validRecords,
      invalidRecords,
      validityRate,
      avgConfidence,
      confidenceBuckets: { high, medium: med, low },
      fieldCompleteness,
      sourceReliability,
      topTags,
      qualityTrend,
    })
  })
}

function emptyInsights() {
  return {
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    validityRate: 0,
    avgConfidence: 0,
    confidenceBuckets: { high: 0, medium: 0, low: 0 },
    fieldCompleteness: [] as Array<{ field: string; filled: number; total: number; rate: number }>,
    sourceReliability: [] as Array<{ hostName: string; fetched: number; failed: number; rate: number }>,
    topTags: [] as Array<{ tag: string; count: number }>,
    qualityTrend: [] as Array<{ date: string; avgScore: number; tasks: number }>,
  }
}
