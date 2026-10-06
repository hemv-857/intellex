import { NextRequest, NextResponse } from 'next/server'
import { buildBackup, parseBackup, restoreBackup, BACKUP_VERSION } from '@/lib/backup'
import { logActivity } from '@/lib/api-utils'

// Workspace backup / restore.
//
// GET  -> the whole workspace as one JSON document
// POST -> restore from a previously exported document
//
// This exists because the free Render plan has no persistent disk: the SQLite
// file is wiped on every deploy, and without this every collected dataset dies
// with it. Auth is the normal APP_TOKEN gate in proxy.ts — no exemption here.

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024

export async function GET(_req: NextRequest) {
  const backup = await buildBackup()
  const filename = `intellex-backup-${backup.exportedAt.slice(0, 10)}.json`

  await logActivity({
    type: 'export',
    message: `Exported workspace backup (${backup.counts.tasks} tasks, ${backup.counts.items} records)`,
    meta: { counts: backup.counts, version: backup.version },
  })

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // The payload is a point-in-time copy of records that do not change while
      // the response streams; a cached copy would be actively misleading.
      'Cache-Control': 'no-store',
    },
  })
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get('content-length') || '0')
  if (declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Backup file too large' }, { status: 413 })
  }

  const raw = await req.text()
  if (raw.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Backup file too large' }, { status: 413 })
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Backup is not valid JSON' }, { status: 400 })
  }

  const parsed = parseBackup(parsedJson)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  try {
    const report = await restoreBackup(parsed.backup)
    await logActivity({
      type: 'backup_restored',
      message:
        `Restored backup: ${report.tasksCreated} task(s), ${report.itemsCreated} record(s)` +
        (report.tasksSkipped ? `, ${report.tasksSkipped} already present` : ''),
      meta: { ...report, version: BACKUP_VERSION },
    })
    return NextResponse.json(report)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Restore failed'
    await logActivity({ type: 'backup_failed', message: `Restore failed: ${msg.slice(0, 200)}` })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}