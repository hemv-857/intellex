import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, rateLimit, schemas, validateBody } from '@/lib/api-utils'
import { claimRun, releaseRun, isRunActive } from '@/lib/run-lease'
import { executeWorkflow, isRunning } from '@/lib/ai'
import { randomUUID } from 'node:crypto'

// POST /api/tasks/[id]/run
// Claims a run lease, clears the previous attempt, then fires the engine without
// awaiting it. The lease (not the status string) is what blocks a concurrent run,
// so a run killed by a crash or redeploy becomes re-runnable once its lease
// expires rather than being stuck 'running' forever.
export const POST = rateLimit({ max: 20, key: 'task-run' })(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  const raw = await req.json().catch(() => ({} as any))
  const parsed = validateBody(schemas.runTask, raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const mode = parsed.data?.mode ?? 'replace'

  const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  if (isRunning(id) || (await isRunActive(id))) {
    return NextResponse.json({ ok: true, status: 'already-running', message: 'Task is already running' })
  }

  const token = randomUUID()
  const lease = await claimRun(id, token)
  if (!lease) {
    return NextResponse.json({ ok: true, status: 'already-running', message: 'Task is already running' })
  }

  await db.task.update({
    where: { id },
    data: {
      status: 'running',
      error: null,
      progress: JSON.stringify({ step: 'search', message: 'Starting execution…', current: 0, total: 0 }),
    },
  })

  // Replace mode wipes first, transactionally: a crash can no longer leave a
  // task with its previous dataset deleted and nothing to show for it.
  // Incremental mode keeps the dataset and lets the engine skip sources it has
  // already read, so a repeat run only pays for what is genuinely new.
  if (mode === 'replace') {
    await db.$transaction([
      db.dataItem.deleteMany({ where: { taskId: id } }),
      db.dataSource.deleteMany({ where: { taskId: id } }),
    ])
  }

  await logActivity({
    type: 'task_run',
    taskId: id,
    message:
      mode === 'incremental'
        ? `Started incremental collection for "${task.title}"`
        : `Started collection for "${task.title}"`,
    meta: { title: task.title, mode },
  })

  executeWorkflow(id, mode)
    .catch((e) => console.error('workflow failed', id, e))
    .finally(() => releaseRun(id, token))

  return NextResponse.json({ ok: true, status: 'started', mode })
})