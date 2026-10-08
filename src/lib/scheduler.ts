import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { executeWorkflow, isRunning, markRunning } from '@/lib/ai'
import { claimRun, releaseRun, reapStaleRuns } from '@/lib/run-lease'
import { maybeAutoBackup, notifyRunFailed } from '@/lib/webhook'

// The scheduler itself, extracted from the HTTP route so it can be driven from
// more than one place: the authenticated /api/scheduler/tick endpoint (cron,
// launchd, scripts/scheduler-tick.sh) and the in-process interval started in
// instrumentation.ts. One implementation, two triggers.

export interface ScheduleConfig {
  enabled: boolean
  intervalMinutes: number
  nextRunAt: string | null
  lastRunAt: string | null
}

const MIN_INTERVAL = 15
const MAX_TICK_BATCH = 200
export const TRASH_RETENTION_DAYS = 30

function parseSchedule(raw: string | null): ScheduleConfig | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return null
    const s = v as Partial<ScheduleConfig>
    const interval = Number(s.intervalMinutes)
    return {
      enabled: !!s.enabled,
      intervalMinutes: Number.isFinite(interval) ? Math.max(MIN_INTERVAL, interval) : MIN_INTERVAL,
      nextRunAt: typeof s.nextRunAt === 'string' ? s.nextRunAt : null,
      lastRunAt: typeof s.lastRunAt === 'string' ? s.lastRunAt : null,
    }
  } catch {
    return null
  }
}

/** Fires every due scheduled task. Idempotent: nextRunAt advances each cycle. */
export async function runSchedulerTick(): Promise<{ processed: number; taskIds: string[] }> {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // Candidate tasks: not soft-deleted, not currently running in DB, schedule not null.
  // (SQLite has no native JSON query via Prisma, so enabled/nextRunAt are validated below.)
  const tasks = await db.task.findMany({
    where: {
      trashedAt: null,
      status: { not: 'running' },
      schedule: { not: null },
    },
    select: { id: true, schedule: true },
    take: MAX_TICK_BATCH,
  })

  const due: Array<{ id: string; intervalMinutes: number }> = []
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
      const startedAt = nowIso
      executeWorkflow(d.id)
        .then(async () => {
          // Re-read the outcome rather than assuming success: executeWorkflow
          // catches its own errors and marks the task failed, so a resolved
          // promise does not mean the run worked.
          const after = await db.task.findUnique({
            where: { id: d.id },
            select: { status: true, error: true, stats: true },
          })
          const failed = after?.status === 'failed'
          const stats = (() => {
            try {
              const v = JSON.parse(after?.stats || '{}')
              return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
            } catch {
              return {}
            }
          })()

          if (failed) {
            const title = (await db.task.findUnique({ where: { id: d.id }, select: { title: true } }))?.title || d.id
            await notifyRunFailed({ taskId: d.id, taskTitle: title, error: after?.error || 'unknown error' })
          }

          await db.activityLog.create({
            data: {
              type: 'schedule_run',
              taskId: d.id,
              message: failed
                ? `Scheduled run failed: ${(after?.error || 'unknown error').slice(0, 200)}`
                : `Scheduled run completed: ${stats.items ?? 0} record(s) from ${stats.sources ?? 0} source(s)`,
              meta: JSON.stringify({
                status: failed ? 'failed' : 'completed',
                error: failed ? (after?.error ?? null) : null,
                items: typeof stats.items === 'number' ? stats.items : null,
                sources: typeof stats.sources === 'number' ? stats.sources : null,
                startedAt,
                durationMs: Date.now() - now,
              }),
            },
          })
        })
        .catch(async (e) => {
          // Only reached if executeWorkflow itself rejects, which it normally
          // does not — recorded anyway so a thrown bug is never silent.
          const msg = (e as Error)?.message || 'Scheduled workflow threw'
          await db.activityLog.create({
            data: {
              type: 'schedule_run',
              taskId: d.id,
              message: `Scheduled run threw: ${msg.slice(0, 200)}`,
              meta: JSON.stringify({
                status: 'failed',
                error: msg.slice(0, 500),
                startedAt,
                durationMs: Date.now() - now,
              }),
            },
          })
        })
        .finally(() => releaseRun(d.id, token))

      processedIds.push(d.id)
    } catch (e) {
      console.error('scheduler tick error for task', d.id, e)
    }
  }

  return { processed: processedIds.length, taskIds: processedIds }
}

/** Hard-deletes trash older than the retention window. Idempotent. */
export async function purgeExpiredTrash(retentionDays = TRASH_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const stale = await db.task.findMany({
    where: { trashedAt: { not: null, lt: cutoff } },
    select: { id: true, title: true, trashedAt: true },
  })

  if (stale.length === 0) return { ok: true, purged: 0, message: 'No stale trash.' }

  await db.task.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } })
  await db.activityLog.createMany({
    data: stale.map((t) => ({
      type: 'task_deleted',
      taskId: null,
      message: `Auto-purged "${t.title}" after ${retentionDays} days in trash`,
      meta: JSON.stringify({ autoPurged: true, retentionDays, trashedAt: t.trashedAt?.toISOString() }),
    })),
  })

  return { ok: true, purged: stale.length, message: `Purged ${stale.length} task(s).` }
}

/**
 * One cycle of everything the scheduler does: reclaim dead runs, fire due
 * collections, and sweep old trash. Returns what happened.
 */
export async function schedulerCycle(opts: { purge?: boolean; backup?: boolean } = {}) {
  const reaped = await reapStaleRuns()
  const tick = await runSchedulerTick()
  const purge = opts.purge ? await purgeExpiredTrash() : null
  // Automatic backup rides the existing cycle rather than a second timer: it is
  // due-checked internally, and one fewer interval is one fewer thing to keep
  // alive. Skipped on the frequent in-process tick to avoid checking on every
  // 60s pass — only the purge cycle runs it, which is every ~6 hours.
  const backup = opts.backup ? await maybeAutoBackup().catch(() => null) : null
  return { ...tick, reaped, purged: purge?.purged ?? 0, backup }
}