// Outbound webhook: automatic workspace backup and failure alerts.
//
// Why this exists: on the free Render plan the SQLite file is wiped on every
// deploy, so manual backups are the only thing between an operator and losing
// every collected dataset. A webhook is the one channel that needs no extra
// infrastructure — it can point at S3/R2, n8n, a Slack or Discord incoming
// webhook, or a plain script on the operator's own box.
//
// The payload can be a full workspace backup, which means this POSTs the user's
// entire dataset to whatever URL is configured. That is deliberate, and it is
// why the URL is validated and run through the same guard the collector uses for
// source pages: a mistyped host must not become an internal-probe primitive.
//
// Scope of that guard, stated honestly: isFetchableUrl inspects the hostname
// literal and does not resolve DNS, so a name that resolves to a private address
// (localtest.me and friends) would pass. That is acceptable here specifically
// because this URL is the operator's own setting behind APP_TOKEN auth, never an
// attacker-supplied value like a search result. The collector, whose URLs really
// are attacker-influenced, is the one that has to be paranoid.

import { db } from '@/lib/db'
import { isFetchableUrl } from '@/lib/url-guard'
import { buildBackup, type Backup } from '@/lib/backup'

const TIMEOUT_MS = 60_000

// A workspace backup can be tens of megabytes. Anything larger is refused rather
// than streamed, because a runaway payload usually means a runaway dataset and
// the operator wants to know that, not have their endpoint fall over.
const MAX_PAYLOAD_BYTES = 64 * 1024 * 1024

export interface WebhookSettings {
  url: string
  enabled: boolean
  backupIntervalMinutes: number
  lastBackupAt?: string | null
  lastResult?: string | null
}

export function parseWebhook(prefs: Record<string, unknown>): WebhookSettings | null {
  const raw = prefs.webhook
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const w = raw as Record<string, unknown>
  if (typeof w.url !== 'string' || !w.url) return null
  const interval = Number(w.backupIntervalMinutes)
  return {
    url: w.url,
    enabled: w.enabled !== false,
    backupIntervalMinutes: Number.isFinite(interval) && interval >= 15 ? Math.floor(interval) : 360,
    lastBackupAt: typeof w.lastBackupAt === 'string' ? w.lastBackupAt : null,
    lastResult: typeof w.lastResult === 'string' ? w.lastResult : null,
  }
}

export type WebhookEvent =
  | { type: 'backup'; backup: Backup }
  | { type: 'run_failed'; taskId: string; taskTitle: string; error: string; at: string }

export async function postWebhook(
  url: string,
  payload: unknown,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!isFetchableUrl(url)) {
    return { ok: false, error: 'Webhook URL is not a public http(s) address' }
  }

  const body = JSON.stringify(payload)
  if (body.length > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: `Backup too large to send (${Math.round(body.length / 1e6)}MB)` }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body,
    })
    if (!res.ok) {
      // Read a short excerpt: endpoint error bodies are usually the only clue
      // about a wrong URL shape or an auth problem.
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      return { ok: false, status: res.status, error: `HTTP ${res.status}${detail ? `: ${detail}` : ''}` }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'request failed' }
  }
}

// Settings live in the existing Setting singleton; merge without clobbering the
// other preference keys.
async function updateWebhookPrefs(patch: Record<string, unknown>) {
  const row = await db.setting.findUnique({ where: { id: 'singleton' } })
  let prefs: Record<string, unknown> = {}
  if (row?.preferences) {
    try {
      const v = JSON.parse(row.preferences)
      if (v && typeof v === 'object' && !Array.isArray(v)) prefs = v as Record<string, unknown>
    } catch {
      // Corrupt preferences must not stop a backup from being recorded.
    }
  }
  const current = (prefs.webhook && typeof prefs.webhook === 'object' ? prefs.webhook : {}) as Record<string, unknown>
  const next = { ...prefs, webhook: { ...current, ...patch } }
  await db.setting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', preferences: JSON.stringify(next) },
    update: { preferences: JSON.stringify(next) },
  })
}

export interface AutoBackupResult {
  ran: boolean
  ok?: boolean
  reason?: string
  counts?: Backup['counts']
}

/**
 * Sends a workspace backup if one is due. Safe to call on every scheduler tick:
 * it decides for itself and returns `{ ran: false }` when nothing to do.
 */
export async function maybeAutoBackup(): Promise<AutoBackupResult> {
  const row = await db.setting.findUnique({ where: { id: 'singleton' } })
  let prefs: Record<string, unknown> = {}
  try {
    const v = row?.preferences ? JSON.parse(row.preferences) : {}
    if (v && typeof v === 'object' && !Array.isArray(v)) prefs = v as Record<string, unknown>
  } catch {
    // fall through with empty prefs
  }

  const hook = parseWebhook(prefs)
  if (!hook) return { ran: false, reason: 'No webhook configured' }
  if (!hook.enabled) return { ran: false, reason: 'Webhook disabled' }

  const lastMs = hook.lastBackupAt ? new Date(hook.lastBackupAt).getTime() : 0
  // A corrupt timestamp must not read as "never backed up" in a way that
  // spams the endpoint; treat it as due, since that is the safe direction.
  const dueInMs = hook.backupIntervalMinutes * 60_000 - (Number.isNaN(lastMs) ? 0 : Date.now() - lastMs)
  if (!Number.isNaN(lastMs) && lastMs > 0 && dueInMs > 0) {
    return { ran: false, reason: `Next backup in ${Math.ceil(dueInMs / 60_000)}m` }
  }

  const backup = await buildBackup()
  const res = await postWebhook(hook.url, { type: 'backup', backup })
  const now = new Date().toISOString()

  await updateWebhookPrefs({
    lastBackupAt: now,
    lastResult: res.ok ? 'ok' : `failed: ${res.error || 'unknown'}`,
  })

  await db.activityLog.create({
    data: {
      type: res.ok ? 'backup_sent' : 'backup_failed',
      message: res.ok
        ? `Auto-backup sent: ${backup.counts.tasks} task(s), ${backup.counts.items} record(s)`
        : `Auto-backup failed: ${res.error}`,
      meta: JSON.stringify({ counts: backup.counts, status: res.status ?? null, error: res.error ?? null }),
    },
  })

  return { ran: true, ok: res.ok, reason: res.error, counts: backup.counts }
}

/** Pushes a scheduled-run failure to the webhook. Never throws. */
export async function notifyRunFailed(input: {
  taskId: string
  taskTitle: string
  error: string
}): Promise<void> {
  try {
    const row = await db.setting.findUnique({ where: { id: 'singleton' } })
    let prefs: Record<string, unknown> = {}
    try {
      const v = row?.preferences ? JSON.parse(row.preferences) : {}
      if (v && typeof v === 'object' && !Array.isArray(v)) prefs = v as Record<string, unknown>
    } catch {
      return
    }
    const hook = parseWebhook(prefs)
    if (!hook || !hook.enabled) return

    await postWebhook(hook.url, {
      type: 'run_failed',
      taskId: input.taskId,
      taskTitle: input.taskTitle,
      error: input.error.slice(0, 500),
      at: new Date().toISOString(),
    })
  } catch {
    // Alerting must never be able to fail a scheduler cycle.
  }
}