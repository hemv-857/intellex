import { NextResponse } from 'next/server'
import { rateLimit, safeApi } from '@/lib/api-utils'
import { visibleCompleted } from '@/lib/visibility'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { qualityScoreSqlText } from '@/lib/quality-sql'

// Every aggregate here used to be computed by loading all completed-task records
// and sources into Node and folding them in JS — ~870ms and ~140MB at 100k rows,
// recomputed from scratch on every open. They are now SQL aggregates: counts,
// json_each() over the record/tag JSON, and a per-day GROUP BY.
//
// Every statement is a tagged template; the only variable parts are date
// cut-offs. No user text reaches SQL.

type CountRow = { n: number }
type BucketRow = { bucket: string; n: number }
type FieldRow = { field: string; filled: number; total: number }
type HostRow = { hostName: string; fetched: number; failed: number }
type TagRow = { tag: string; n: number }
type TrendRow = { day: string; sum: number; n: number }

export const GET = rateLimit({ max: 60, key: 'insights' })(function GET() {
  return safeApi(async () => {
    const completedCount = await db.task.count({ where: visibleCompleted })
    if (completedCount === 0) return NextResponse.json(emptyInsights())

    const since = new Date(Date.now() - 13 * 86_400_000)

    const [
      totalRows,
      validRows,
      avgRows,
      bucketRows,
      fieldRows,
      hostRows,
      tagRows,
      trendRows,
    ] = await Promise.all([
      db.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS n FROM DataItem d
        JOIN Task t ON t.id = d.taskId
        WHERE t.status = 'completed' AND t.trashedAt IS NULL`),

      db.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS n FROM DataItem d
        JOIN Task t ON t.id = d.taskId
        WHERE t.status = 'completed' AND t.trashedAt IS NULL AND d.valid = 1`),

      db.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COALESCE(AVG(d.confidence), 0) AS n FROM DataItem d
        JOIN Task t ON t.id = d.taskId
        WHERE t.status = 'completed' AND t.trashedAt IS NULL`),

      db.$queryRaw<BucketRow[]>(Prisma.sql`
        SELECT CASE WHEN d.confidence >= 75 THEN 'high'
                    WHEN d.confidence >= 50 THEN 'medium'
                    ELSE 'low' END AS bucket,
               COUNT(*) AS n
        FROM DataItem d JOIN Task t ON t.id = d.taskId
        WHERE t.status = 'completed' AND t.trashedAt IS NULL
        GROUP BY bucket`),

      // Completeness per field name, using SQLite's json_each instead of
      // parsing every record blob in Node.
      db.$queryRaw<FieldRow[]>(Prisma.sql`
        SELECT je.key AS field,
               COUNT(*) AS total,
               SUM(CASE WHEN je.value IS NOT NULL
                         AND TRIM(CAST(je.value AS TEXT)) <> ''
                         AND CAST(je.value AS TEXT) <> 'null' THEN 1 ELSE 0 END) AS filled
        FROM DataItem d
        JOIN Task t ON t.id = d.taskId
        JOIN json_each(d.data) je
        WHERE t.status = 'completed' AND t.trashedAt IS NULL
          AND je.type <> 'object' AND je.type <> 'array'
        GROUP BY je.key
        ORDER BY total DESC, field ASC`),

      db.$queryRaw<HostRow[]>(Prisma.sql`
        SELECT COALESCE(s.hostName, '(unknown)') AS hostName,
               SUM(CASE WHEN s.fetchStatus = 'fetched' THEN 1 ELSE 0 END) AS fetched,
               SUM(CASE WHEN s.fetchStatus = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM DataSource s JOIN Task t ON t.id = s.taskId
        WHERE t.status = 'completed' AND t.trashedAt IS NULL
        GROUP BY hostName
        ORDER BY (fetched + failed) DESC
        LIMIT 10`),

      db.$queryRaw<TagRow[]>(Prisma.sql`
        SELECT je.value AS tag, COUNT(*) AS n
        FROM Task t JOIN json_each(COALESCE(t.tags, '[]')) je
        WHERE t.status = 'completed' AND t.trashedAt IS NULL
          AND typeof(je.value) = 'text' AND TRIM(CAST(je.value AS TEXT)) <> ''
        GROUP BY tag
        ORDER BY n DESC, tag ASC
        LIMIT 15`),

      db.$queryRaw<TrendRow[]>(Prisma.sql`
        SELECT date(COALESCE(t.completedAt, t.createdAt) / 1000, 'unixepoch') AS day,
               SUM(${Prisma.raw(qualityScoreSqlText)}) AS sum,
               COUNT(*) AS n
        FROM Task t
        WHERE t.status = 'completed' AND t.trashedAt IS NULL
          AND COALESCE(t.completedAt, t.createdAt) >= ${since}
          AND COALESCE(json_extract(t.stats, '$.items'), 0) > 0
        GROUP BY day
        ORDER BY day ASC`),
    ])

    const totalRecords = Number(totalRows[0]?.n ?? 0)
    const validRecords = Number(validRows[0]?.n ?? 0)
    const avgConfidence = Math.round(Number(avgRows[0]?.n ?? 0) * 10) / 10

    const buckets = { high: 0, medium: 0, low: 0 }
    for (const b of bucketRows) {
      if (b.bucket === 'high') buckets.high = Number(b.n)
      else if (b.bucket === 'medium') buckets.medium = Number(b.n)
      else buckets.low = Number(b.n)
    }

    // The 14-day trend always returns 14 points, zero-filled, so the chart does
    // not change shape depending on which days happen to have data.
    const byDay = new Map(trendRows.map((r) => [r.day, r]))
    const qualityTrend: Array<{ date: string; avgScore: number; tasks: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000)
      const key = d.toISOString().slice(0, 10)
      const row = byDay.get(key)
      const n = Number(row?.n ?? 0)
      qualityTrend.push({
        date: key,
        avgScore: n > 0 ? Math.round(Number(row!.sum) / n) : 0,
        tasks: n,
      })
    }

    return NextResponse.json({
      totalRecords,
      validRecords,
      invalidRecords: totalRecords - validRecords,
      validityRate: totalRecords > 0 ? Math.round((validRecords / totalRecords) * 1000) / 10 : 0,
      avgConfidence,
      confidenceBuckets: buckets,
      fieldCompleteness: fieldRows.map((r) => {
        const total = Number(r.total)
        const filled = Number(r.filled)
        return { field: r.field, filled, total, rate: total > 0 ? Math.round((filled / total) * 1000) / 10 : 0 }
      }),
      sourceReliability: hostRows.map((r) => {
        const fetched = Number(r.fetched)
        const failed = Number(r.failed)
        const total = fetched + failed
        return { hostName: r.hostName, fetched, failed, rate: total > 0 ? Math.round((fetched / total) * 1000) / 10 : 0 }
      }),
      topTags: tagRows.map((r) => ({ tag: r.tag, count: Number(r.n) })),
      qualityTrend,
    })
  })
})

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
