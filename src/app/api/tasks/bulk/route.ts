import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/api-utils'

// POST /api/tasks/bulk  { ids: string[], action: 'delete' | 'purge' | 'restore' | 'pin' | 'unpin' }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : []
  const action = String(body?.action || '')

  if (ids.length === 0) return NextResponse.json({ error: 'ids[] required' }, { status: 400 })
  if (!['delete', 'purge', 'restore', 'pin', 'unpin'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

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
  } else if (action === 'pin' || action === 'unpin') {
    const pinned = action === 'pin'
    const r = await db.task.updateMany({ where: { id: { in: foundIds } }, data: { pinned } })
    affected = r.count
    for (const t of tasks) {
      await logActivity({ type: 'task_pinned', taskId: t.id, message: `${pinned ? 'Pinned' : 'Unpinned'} task "${t.title}" (bulk)`, meta: { bulk: true, pinned } })
    }
  }

  return NextResponse.json({ ok: true, action, affected, requested: ids.length })
}
