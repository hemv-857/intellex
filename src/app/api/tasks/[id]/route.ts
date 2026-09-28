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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const task = await db.task.findUnique({ where: { id }, select: { id: true, title: true } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    // Log BEFORE delete (FK is ON DELETE SET NULL, so taskId is preserved here but will
    // be nulled on the ActivityLog row once the task is removed — keep title in the message
    // so the entry remains traceable after deletion).
    await logActivity({
      type: 'task_deleted',
      taskId: id,
      message: `Deleted task "${task.title}"`,
      meta: { title: task.title },
    })

    await db.task.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
}
