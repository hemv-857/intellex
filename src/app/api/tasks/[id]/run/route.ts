import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { executeWorkflow, isRunning, markRunning, markDone } from '@/lib/ai'
import { logActivity } from '@/lib/api-utils'

// POST /api/tasks/[id]/run  -> kick off workflow execution (async, fire-and-forget)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  if (task.status === 'running' || isRunning(id)) {
    return NextResponse.json({ ok: true, status: 'already-running', message: 'Task is already running' })
  }

  // reset transient state then mark running
  await db.task.update({
    where: { id },
    data: {
      status: 'running',
      error: null,
      progress: JSON.stringify({ step: 'search', message: 'Starting execution…', current: 0, total: 0 }),
    },
  })
  // clear previous artifacts so re-runs are clean
  await db.dataItem.deleteMany({ where: { taskId: id } })
  await db.dataSource.deleteMany({ where: { taskId: id } })

  markRunning(id)
  // fire and forget — process stays alive in `next dev`
  executeWorkflow(id)
    .catch((e) => console.error('workflow failed', id, e))
    .finally(() => markDone(id))

  await logActivity({
    type: 'task_run',
    taskId: id,
    message: `Started collection for "${task.title}"`,
    meta: { title: task.title },
  })

  return NextResponse.json({ ok: true, status: 'running' })
}
