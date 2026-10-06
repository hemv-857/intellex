import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, rateLimit } from '@/lib/api-utils'
import { schedulerCycle } from '@/lib/scheduler'
import { isUnacknowledged } from '@/lib/alert-state'

// Scheduled-run history and alerts.
//
// A scheduled collection is fire-and-forget: it fires from a 60s interval, and
// when it fails nothing surfaces. The task's status flips to 'failed' and that
// is the entire signal, so a task quietly broken for a week looks identical to
// one that never ran.
//
// Outcomes are recorded in ActivityLog (type 'schedule_run') by
// lib/scheduler.ts, and failures stay unacknowledged until an operator says they
// have seen them. That is the whole feature: make a silent failure impossible
// to miss.
//
// This sits under the normal /api gate, so it authenticates with APP_TOKEN
// rather than SCHEDULER_KEY — the browser holds a session cookie and has no way
// to present the scheduler key. A monitoring script can use a bearer APP_TOKEN.

const MAX_LIMIT = 200

function safeObj(s?: string | null): Record<string, unknown> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

// GET /api/alerts?limit=50&status=failed|completed&taskId=…
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limitRaw = Number(searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_LIMIT)
    : 50
  const status = searchParams.get('status')?.trim() || undefined
  const taskId = searchParams.get('taskId')?.trim() || undefined

  const where: Record<string, unknown> = { type: 'schedule_run' }
  if (taskId) where.taskId = taskId

  const [all, settings] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { task: { select: { id: true, title: true } } },
    }),
    db.setting.findUnique({ where: { id: 'singleton' } }),
  ])

  const prefs = safeObj(settings?.preferences)
  const seenAt = typeof prefs.alertsSeenAt === 'string' ? prefs.alertsSeenAt : null

  const runs = all.map((r) => {
    const meta = safeObj(r.meta)
    const runStatus = String(meta.status ?? '')
    return {
      id: r.id,
      taskId: r.taskId,
      taskTitle: r.task?.title ?? null,
      status: runStatus,
      message: r.message,
      startedAt: typeof meta.startedAt === 'string' ? meta.startedAt : r.createdAt.toISOString(),
      durationMs: typeof meta.durationMs === 'number' ? meta.durationMs : null,
      items: typeof meta.items === 'number' ? meta.items : null,
      sources: typeof meta.sources === 'number' ? meta.sources : null,
      error: typeof meta.error === 'string' ? meta.error : null,
      unacknowledged: isUnacknowledged(runStatus, r.createdAt.getTime(), prefs),
    }
  })

  return NextResponse.json({
    runs: status ? runs.filter((r) => r.status === status) : runs,
    unacknowledgedCount: runs.filter((r) => r.unacknowledged).length,
    alertsSeenAt: seenAt ?? null,
  })
}

// POST /api/alerts
//   {}                        -> acknowledge everything currently failing
//   {"tick": true}            -> force one scheduler cycle now
//   {"tick": true, "purge":1} -> same, plus the trash purge
export const POST = rateLimit({ max: 20, key: 'alerts' })(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({} as any))

  if (body?.tick === true) {
    const result = await schedulerCycle({ purge: body?.purge === 1 })
    await logActivity({
      type: 'scheduler_tick',
      message: `Manual scheduler tick: ${result.processed} task(s) fired, ${result.reaped.length} stale lease(s) reaped`,
      meta: { processed: result.processed, reaped: result.reaped.length, purged: result.purged },
    })
    return NextResponse.json({ ok: true, ticked: true, ...result })
  }

  const seenAt = new Date().toISOString()
  const row = await db.setting.findUnique({ where: { id: 'singleton' } })
  const prefs = safeObj(row?.preferences)
  await db.setting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', preferences: JSON.stringify({ alertsSeenAt: seenAt }) },
    update: { preferences: JSON.stringify({ ...prefs, alertsSeenAt: seenAt }) },
  })

  return NextResponse.json({ ok: true, alertsSeenAt: seenAt })
})