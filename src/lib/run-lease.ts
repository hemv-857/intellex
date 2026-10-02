import { db } from '@/lib/db'

// Run lifecycle. Execution is fire-and-forget inside the Next.js process, so a
// crash mid-run used to leave status='running' forever with no way back — the run
// guard refused re-runs and no route could move the task out of that state.
//
// A lease fixes that: a run claims the task with a token and a timestamp, the
// guard checks the lease rather than the status string, and any run whose lease
// is older than STALE_RUN_MS is dead by definition and can be reclaimed.

export const STALE_RUN_MS = 10 * 60 * 1000 // 10 minutes

export type RunLease = { token: string; startedAt: Date }

function isLiveLease(startedAt: Date | null, now = Date.now()): boolean {
  return !!startedAt && now - startedAt.getTime() < STALE_RUN_MS
}

// Claims the task for a new run. Returns null when a live run already holds it,
// which makes claim-and-check a single atomic conditional update rather than a
// check-then-act race.
export async function claimRun(taskId: string, token: string): Promise<RunLease | null> {
  const startedAt = new Date()
  const claimed = await db.task.updateMany({
    where: { id: taskId, OR: [{ startedAt: null }, { startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) } }] },
    data: { status: 'running', startedAt, runToken: token, error: null },
  })
  if (claimed.count === 0) return null
  return { token, startedAt }
}

// A task is busy if its status says running AND its lease has not expired.
// An expired lease means the process died, so the task is runnable again.
export async function isRunActive(taskId: string): Promise<boolean> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { status: true, startedAt: true } })
  if (!task) return false
  if (task.status !== 'running') return false
  return isLiveLease(task.startedAt)
}

export async function releaseRun(taskId: string, token: string) {
  await db.task.updateMany({
    where: { id: taskId, runToken: token },
    data: { startedAt: null, runToken: null },
  })
}

// Marks any run whose lease expired as failed so the UI stops spinning and the
// operator can re-run. Safe to call repeatedly; returns the ids it reclaimed.
export async function reapStaleRuns(now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STALE_RUN_MS)
  // Dead means either the lease expired, or there is no lease at all — a row
  // left as 'running' by a process that predates leases can never be reclaimed
  // by the expiry check alone, because NULL never satisfies `lt`.
  const dead = {
    status: 'running',
    OR: [{ startedAt: null }, { startedAt: { lt: cutoff } }],
  }
  const stale = await db.task.findMany({
    where: dead,
    select: { id: true },
  })
  if (stale.length === 0) return []

  await db.task.updateMany({
    where: { id: { in: stale.map((t) => t.id) }, ...dead },
    data: {
      status: 'failed',
      startedAt: null,
      runToken: null,
      error: 'Collection run was interrupted (lease expired) and has been marked failed. Re-run to retry.',
    },
  })
  return stale.map((t) => t.id)
}