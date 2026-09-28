import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/api-utils'

function safeArr(s?: string | null): any[] {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
}
function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const task = await db.task.findUnique({
    where: { id },
    include: {
      sources: { orderBy: { rank: 'asc' }, take: 200 },
      dataItems: { orderBy: { createdAt: 'asc' }, take: 500 },
    },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      status: task.status,
      objective: task.objective,
      fields: safeArr(task.fields),
      searchQueries: safeArr(task.searchQueries),
      sourceStrategy: safeArr(task.sourceStrategy),
      validationRules: safeArr(task.validationRules),
      tags: safeArr(task.tags),
      workflow: safeArr(task.workflow),
      progress: safeObj(task.progress),
      stats: safeObj(task.stats),
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
    sources: task.sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      snippet: s.snippet,
      hostName: s.hostName,
      favicon: s.favicon,
      publishedTime: s.publishedTime,
      rank: s.rank,
      fetchStatus: s.fetchStatus,
      tokensUsed: s.tokensUsed,
      contentExcerpt: s.contentExcerpt,
      fetchedAt: s.fetchedAt,
    })),
    items: task.dataItems.map((it) => ({
      id: it.id,
      title: it.title,
      summary: it.summary,
      confidence: it.confidence,
      valid: it.valid,
      data: safeObj(it.data),
      sourceId: it.sourceId,
      createdAt: it.createdAt,
    })),
  })
}

// PATCH /api/tasks/[id]  { pinned?: boolean, restore?: boolean, purge?: boolean }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({} as any))
  const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true, pinned: true, trashedAt: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Hard purge (permanent delete)
  if (body?.purge) {
    await logActivity({
      type: 'task_deleted',
      taskId: id,
      message: `Permanently deleted task "${task.title}"`,
      meta: { title: task.title, purged: true },
    })
    await db.task.delete({ where: { id } })
    return NextResponse.json({ ok: true, purged: true })
  }

  // Restore from trash
  if (body?.restore) {
    await db.task.update({ where: { id }, data: { trashedAt: null } })
    await logActivity({
      type: 'task_restored',
      taskId: id,
      message: `Restored task "${task.title}" from trash`,
      meta: { title: task.title },
    })
    return NextResponse.json({ ok: true, restored: true })
  }

  // Pin/unpin
  if (typeof body?.pinned === 'boolean') {
    await db.task.update({ where: { id }, data: { pinned: body.pinned } })
    await logActivity({
      type: 'task_pinned',
      taskId: id,
      message: body.pinned ? `Pinned task "${task.title}"` : `Unpinned task "${task.title}"`,
      meta: { title: task.title, pinned: body.pinned },
    })
    return NextResponse.json({ ok: true, pinned: body.pinned })
  }

  return NextResponse.json({ error: 'No valid action (pinned | restore | purge)' }, { status: 400 })
}

// DELETE /api/tasks/[id]  -> soft-delete (move to trash)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true, trashedAt: true } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    await db.task.update({ where: { id }, data: { trashedAt: new Date() } })
    await logActivity({
      type: 'task_deleted',
      taskId: id,
      message: `Moved task "${task.title}" to trash`,
      meta: { title: task.title, softDelete: true },
    })
    return NextResponse.json({ ok: true, trashed: true })
  } catch {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
}
