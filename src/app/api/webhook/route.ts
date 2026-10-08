import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateBody, schemas, rateLimit } from '@/lib/api-utils'
import { isFetchableUrl } from '@/lib/url-guard'
import { buildBackup } from '@/lib/backup'
import { postWebhook, parseWebhook } from '@/lib/webhook'

// Webhook configuration for automatic backups and failure alerts.
//
// GET   -> current configuration (URL included; it is the operator's own)
// POST  -> save, or send one now with { "sendNow": true }
//
// The URL receives the entire workspace on each backup, so it is validated as
// http(s) and refused if it points anywhere non-public.

function safeObj(s?: string | null): Record<string, unknown> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export async function GET() {
  const row = await db.setting.findUnique({ where: { id: 'singleton' } })
  return NextResponse.json({ webhook: parseWebhook(safeObj(row?.preferences)) })
}

export const POST = rateLimit({ max: 20, key: 'webhook' })(async (req: NextRequest) => {
  const raw = await req.json().catch(() => ({} as any))

  // --- send a backup immediately -----------------------------------------
  if (raw?.sendNow === true) {
    const row = await db.setting.findUnique({ where: { id: 'singleton' } })
    const hook = parseWebhook(safeObj(row?.preferences))
    if (!hook) {
      return NextResponse.json({ error: 'No webhook configured' }, { status: 400 })
    }
    const backup = await buildBackup()
    const res = await postWebhook(hook.url, { type: 'backup', backup })
    await db.activityLog.create({
      data: {
        type: res.ok ? 'backup_sent' : 'backup_failed',
        message: res.ok
          ? `Manual backup sent: ${backup.counts.tasks} task(s), ${backup.counts.items} record(s)`
          : `Manual backup failed: ${res.error}`,
        meta: JSON.stringify({ counts: backup.counts, status: res.status ?? null, error: res.error ?? null }),
      },
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 502 })
    }
    return NextResponse.json({ ok: true, counts: backup.counts })
  }

  // --- save configuration --------------------------------------------------
  const parsed = validateBody(schemas.webhook, raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const incoming = parsed.data
  if (!incoming) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })

  // Validate again here rather than trusting the schema alone: this value is
  // about to receive the whole dataset, so an unparseable or internal URL must
  // not get as far as being stored.
  let urlOk = false
  try {
    urlOk = isFetchableUrl(incoming.url || '')
  } catch {
    urlOk = false
  }
  if (!urlOk) {
    return NextResponse.json(
      { error: 'Webhook URL must be a public http(s) address' },
      { status: 400 },
    )
  }

  const next = {
    url: incoming.url,
    enabled: incoming.enabled !== false,
    backupIntervalMinutes: incoming.backupIntervalMinutes ?? 360,
  }

  const row = await db.setting.findUnique({ where: { id: 'singleton' } })
  const prefs = safeObj(row?.preferences)
  const prev = (prefs.webhook && typeof prefs.webhook === 'object' ? prefs.webhook : {}) as Record<string, unknown>
  // Keep lastBackupAt/lastResult so saving the URL does not look like a backup.
  await db.setting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', preferences: JSON.stringify({ ...prefs, webhook: next }) },
    update: { preferences: JSON.stringify({ ...prefs, webhook: { ...prev, ...next } }) },
  })

  return NextResponse.json({ ok: true, webhook: next })
})
