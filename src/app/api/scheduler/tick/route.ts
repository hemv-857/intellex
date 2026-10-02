import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/api-utils'
import { isSchedulerDisabled, schedulerKeyMatches } from '@/lib/scheduler-auth'
import { claimRun, releaseRun, reapStaleRuns } from '@/lib/run-lease'
import { executeWorkflow, isRunning, markRunning, markDone } from '@/lib/ai'
import { randomUUID } from 'node:crypto'

// ---------------------------------------------------------------------------
// Scheduler tick — finds due scheduled tasks and kicks them off (fire-and-forget)
// Safe to call repeatedly: idempotent (nextRunAt advances on each cycle).
// ---------------------------------------------------------------------------

interface ScheduleConfig {
  enabled: boolean
  intervalMinutes: number
  nextRunAt: string | null
  lastRunAt: string | null
}

const MIN_INTERVAL = 15

function parseSchedule(raw: string | null | undefined): ScheduleConfig | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    const intervalMinutes = Number(parsed.intervalMinutes)
    return {
      enabled: !!parsed.enabled,
      intervalMinutes:
        Number.isFinite(intervalMinutes) && intervalMinutes >= MIN_INTERVAL
          ? Math.floor(intervalMinutes)
          : 60,
      nextRunAt: parsed.nextRunAt ? String(parsed.nextRunAt) : null,
      lastRunAt: parsed.lastRunAt ? String(parsed.lastRunAt) : null,
    }
  } catch {
    return null
  }
}

async function runTick(): Promise<{ processed: number; taskIds: string[] }> {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // Candidate tasks: not soft-deleted, not currently running in DB, schedule column not null.
  // (SQLite has no native JSON query via Prisma, so enabled/nextRunAt are validated in JS below.)
  const tasks = await db.task.findMany({
    where: {
      trashedAt: null,
      status: { not: 'running' },
      schedule: { not: null },
    },
    select: { id: true, schedule: true },
    take: 200,
  })

  const due: { id: string; intervalMinutes: number }[] = []
  for (const t of tasks) {
    if (isRunning(t.id)) continue
    const sched = parseSchedule(t.schedule)
    if (!sched || !sched.enabled || !sched.nextRunAt) continue
    const next = new Date(sched.nextRunAt).getTime()
    if (Number.isNaN(next)) continue
    if (next <= now) due.push({ id: t.id, intervalMinutes: sched.intervalMinutes })
  }

  const processedIds: string[] = []
  for (const d of due) {
    try {
      // 1) Claim the lease atomically. A stale lease (crashed run) is reclaimable;
      //    a live one means someone is already running this task, so skip it.
      const token = randomUUID()
      const lease = await claimRun(d.id, token)
      if (!lease) continue

      // 2) Advance the schedule first so a duplicate tick can't re-fire it.
      //    Preserves whatever interval is configured right now rather than the
      //    value read at scan time.
      await db.task.update({
        where: { id: d.id },
        data: {
          schedule: JSON.stringify({
            enabled: true,
            intervalMinutes: d.intervalMinutes,
            nextRunAt: new Date(now + d.intervalMinutes * 60_000).toISOString(),
            lastRunAt: nowIso,
          } satisfies ScheduleConfig),
          progress: JSON.stringify({
            step: 'search',
            message: 'Scheduled run starting…',
            current: 0,
            total: 0,
          }),
        },
      })

      // 3) Clear the previous attempt in one transaction.
      await db.$transaction([
        db.dataItem.deleteMany({ where: { taskId: d.id } }),
        db.dataSource.deleteMany({ where: { taskId: d.id } }),
      ])

      // 4) Fire-and-forget the workflow
      markRunning(d.id)
      executeWorkflow(d.id)
        .catch((e) => console.error('scheduled workflow failed', d.id, e))
        .finally(() => releaseRun(d.id, token))

      processedIds.push(d.id)
    } catch (e) {
      console.error('scheduler tick error for task', d.id, e)
    }
  }

  return { processed: processedIds.length, taskIds: processedIds }
}

// Shared handler — accepts GET or POST. Requires ?key= matching SCHEDULER_KEY env.
async function handler(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  if (isSchedulerDisabled()) {
    return NextResponse.json({ error: 'Scheduler disabled: SCHEDULER_KEY is not set' }, { status: 503 })
  }
  if (!schedulerKeyMatches(searchParams.get('key'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Reclaim runs whose lease expired before scheduling anything new, so a task
  // killed by a crash or redeploy stops showing as perpetually running.
  const reaped = await reapStaleRuns()

  // Returns immediately after queueing fire-and-forget work.
  const result = await runTick()
  return NextResponse.json({ ...result, reaped })
}

// GET /api/scheduler/tick?key=...
export const GET = rateLimit({ max: 60, key: 'scheduler' })(handler)

// POST /api/scheduler/tick?key=...  (same behavior, alternative verb)
export const POST = rateLimit({ max: 60, key: 'scheduler' })(handler)
