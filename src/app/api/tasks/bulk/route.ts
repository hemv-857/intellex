import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity, rateLimit, schemas, validateBody } from '@/lib/api-utils'
import { duplicateTask } from '@/lib/duplicate'

// POST /api/tasks/bulk  { ids: string[], action: 'delete' | 'purge' | 'restore' | 'pin' | 'unpin' | 'duplicate' }
export const POST = rateLimit({ max: 20, key: 'bulk' })(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({} as any))
  const parsed = validateBody(schemas.bulkTasks, body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const ids: string[] = parsed.data.ids
  const action = parsed.data.action

  const tasks = await db.task.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })
  const foundIds = tasks.map((t) => t.id)

  let affected = 0
  if (action === 'delete') {
    const r = await db.task.updateMany({ where: { id: { in: foundIds } }, data: { trashedAt: new Date() } })
    affected = r.count
    for (const t of tasks) {
      await logActivity({ type: 'task_deleted', taskId: t.id, message: `Moved task "${t.title}" to trash (bulk)`, meta: { bulk: true } })
    }
  } else if (action === 'purge') {
    for (const t of tasks) {
      await logActivity({ type: 'task_deleted', taskId: t.id, message: `Permanently deleted task "${t.title}" (bulk)`, meta: { bulk: true, purged: true } })
    }
    const r = await db.task.deleteMany({ where: { id: { in: foundIds } } })
    affected = r.count
  } else if (action === 'restore') {
    const r = await db.task.updateMany({ where: { id: { in: foundIds } }, data: { trashedAt: null } })
    affected = r.count
    for (const t of tasks) {
      await logActivity({ type: 'task_restored', taskId: t.id, message: `Restored task "${t.title}" from trash (bulk)`, meta: { bulk: true } })
    }
  } else if (action === 'duplicate') {
    // Clones share one implementation with the single-task duplicate route.
    const created: Array<{ id: string; title: string }> = []
    const errors: Array<{ id: string; error: string }> = []
    for (const id of foundIds) {
      const r = await duplicateTask(id)
      if ('error' in r) errors.push({ id, error: r.error })
      else created.push({ id: r.id, title: r.title })
    }
    return NextResponse.json({
      ok: errors.length === 0,
      action,
      affected: created.length,
      requested: ids.length,
      created,
      errors,
    })
  } else if (action === 'pin' || action === 'unpin') {
    const pinned = action === 'pin'
    const r = await db.task.updateMany({ where: { id: { in: foundIds } }, data: { pinned } })
    affected = r.count
    for (const t of tasks) {
      await logActivity({ type: 'task_pinned', taskId: t.id, message: `${pinned ? 'Pinned' : 'Unpinned'} task "${t.title}" (bulk)`, meta: { bulk: true, pinned } })
    }
  }

  return NextResponse.json({ ok: true, action, affected, requested: ids.length })
})
