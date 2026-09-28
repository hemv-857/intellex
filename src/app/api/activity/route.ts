import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Activity log API — recent activity, newest first, joined with task title.
// ---------------------------------------------------------------------------

function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  const yr = Math.floor(mo / 12)
  return `${yr}y ago`
}

// GET /api/activity?limit=50&type=
//   - limit: 1..200 (default 50)
//   - type:  optional filter by activity type (e.g. task_created, task_run, task_scheduled)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limitRaw = Number(searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
    : 50
  const type = searchParams.get('type')?.trim() || undefined

  const where: any = {}
  if (type) where.type = type

  const logs = await db.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { task: { select: { id: true, title: true } } },
  })

  return NextResponse.json({
    activities: logs.map((l) => ({
      id: l.id,
      taskId: l.taskId,
      taskTitle: l.task?.title ?? null,
      type: l.type,
      message: l.message,
      meta: safeObj(l.meta),
      createdAt: l.createdAt,
      timeAgo: timeAgo(l.createdAt),
    })),
  })
}
