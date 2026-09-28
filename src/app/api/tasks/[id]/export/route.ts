import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { logActivity, safeApi } from '@/lib/api-utils'

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

function slug(s: string) {
  return (s || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

// GET /api/tasks/[id]/export?format=csv|json|xlsx
export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return safeApi(async () => {
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

    // Log export activity (non-blocking, never fail the request on log error)
    void logActivity({
      type: 'export',
      taskId: task.id,
      message: `Exported task "${task.title}" as ${format.toUpperCase()}`,
      meta: { format, count: items.length },
    })

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

    if (format === 'xlsx') {
      const header = [...fields, 'confidence', 'valid', 'sourceUrl']
      const rows: Record<string, unknown>[] = []
      for (let i = 0; i < task.dataItems.length; i++) {
        const it = task.dataItems[i]
        const d = safeObj(it.data)
        const source = task.sources.find((s) => s.id === it.sourceId)
        const row: Record<string, unknown> = {}
        for (const f of fields) row[f] = d[f] ?? ''
        row['confidence'] = it.confidence
        row['valid'] = it.valid
        row['sourceUrl'] = source?.url || ''
        rows.push(row)
      }

      const ws = XLSX.utils.json_to_sheet(rows, { header })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data')

      // Optional second sheet with task meta + sources
      const metaRows = [
        { key: 'Title', value: task.title },
        { key: 'Prompt', value: task.prompt },
        { key: 'Objective', value: task.objective || '' },
        { key: 'Exported At', value: new Date().toISOString() },
        { key: 'Record Count', value: items.length },
        { key: 'Source Count', value: task.sources.length },
        { key: 'Fields', value: fields.join(', ') },
      ]
      const metaWs = XLSX.utils.json_to_sheet(metaRows)
      XLSX.utils.book_append_sheet(wb, metaWs, 'Info')

      const sourcesRows = task.sources.map((s) => ({
        url: s.url,
        title: s.title || '',
        hostName: s.hostName || '',
        fetchStatus: s.fetchStatus,
        tokensUsed: s.tokensUsed,
        fetchedAt: s.fetchedAt ? new Date(s.fetchedAt).toISOString() : '',
      }))
      if (sourcesRows.length > 0) {
        const srcWs = XLSX.utils.json_to_sheet(sourcesRows)
        XLSX.utils.book_append_sheet(wb, srcWs, 'Sources')
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${slug(task.title)}.xlsx"`,
        },
      })
    }

    // CSV (default)
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
  })
}
