import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function safeArr(s?: string | null): any[] {
  if (!s) return []
  try { return JSON.parse(s) } catch { return [] }
}
function safeObj(s?: string | null): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/[",\n\r"]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// GET /api/tasks/[id]/export?format=csv|json
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const format = (searchParams.get('format') || 'csv').toLowerCase()

  const task = await db.task.findUnique({
    where: { id },
    include: { dataItems: { orderBy: { createdAt: 'asc' }, take: 2000 }, sources: true },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const fields = safeArr(task.fields).map((f: any) => f.name as string)
  const items = task.dataItems.map((it) => safeObj(it.data))

  if (format === 'json') {
    const payload = {
      task: { id: task.id, title: task.title, prompt: task.prompt, objective: task.objective, fields: safeArr(task.fields) },
      exportedAt: new Date().toISOString(),
      count: items.length,
      records: items,
      sources: task.sources.map((s) => ({ url: s.url, title: s.title, hostName: s.hostName, fetchedAt: s.fetchedAt })),
    }
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug(task.title)}.json"`,
      },
    })
  }

  // CSV
  const header = [...fields, 'confidence', 'valid', 'sourceUrl']
  const rows: string[] = [header.map(csvEscape).join(',')]
  for (let i = 0; i < task.dataItems.length; i++) {
    const it = task.dataItems[i]
    const d = safeObj(it.data)
    const source = task.sources.find((s) => s.id === it.sourceId)
    const row = [
      ...fields.map((f) => csvEscape(d[f])),
      csvEscape(it.confidence),
      csvEscape(it.valid),
      csvEscape(source?.url || ''),
    ]
    rows.push(row.join(','))
  }
  const csv = rows.join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug(task.title)}.csv"`,
    },
  })
}

function slug(s: string) {
  return (s || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}
