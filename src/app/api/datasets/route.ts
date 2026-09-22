import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

// GET /api/datasets?q=&tag=  -> all data items across tasks (with task meta)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.toLowerCase() || undefined
  const tag = searchParams.get('tag') || undefined

  const taskWhere: any = { status: 'completed' }
  if (tag) {
    // SQLite has no native array filter; fetch tasks and filter in memory by tag
  }

  // fetch tasks first (optionally filtered by tag in-memory)
  let tasks = await db.task.findMany({
    where: taskWhere,
    orderBy: { createdAt: 'desc' },
    include: { dataItems: { orderBy: { createdAt: 'asc' } } },
  })
  if (tag) {
    tasks = tasks.filter((t) => {
      const tags = safeObj(t.tags)
      return Array.isArray(tags) ? tags.includes(tag) : false
    })
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const records: any[] = []
  for (const t of tasks) {
    for (const it of t.dataItems) {
      const data = safeObj(it.data)
      const blob = `${it.title ?? ''} ${it.summary ?? ''} ${JSON.stringify(data)}`.toLowerCase()
      if (q && !blob.includes(q)) continue
      records.push({
        id: it.id,
        taskId: t.id,
        taskTitle: t.title,
        title: it.title,
        summary: it.summary,
        confidence: it.confidence,
        valid: it.valid,
        data,
        tags: Array.isArray(safeObj(t.tags)) ? safeObj(t.tags) : [],
        fields: safeObj(t.fields),
        createdAt: it.createdAt,
      })
    }
  }

  return NextResponse.json({
    count: records.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      tags: safeObj(t.tags),
      stats: safeObj(t.stats),
      fields: safeObj(t.fields),
      updatedAt: t.updatedAt,
    })),
    records: records.slice(0, 1000),
  })
}
