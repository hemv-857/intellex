'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Webhook, Loader2, Send, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { api } from './shared'

// Webhook configuration for automatic backups and failure alerts.
//
// On the free plan the database is wiped on every deploy, so an operator who
// never opens the backup page loses everything. This makes the backup automatic
// and pushes failures out of the app, so a broken schedule is noticed even when
// nobody is looking at the dashboard.

interface WebhookState {
  url: string
  enabled: boolean
  backupIntervalMinutes: number
  lastBackupAt: string | null
  lastResult: string | null
}

export function WebhookSettings() {
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [intervalHours, setIntervalHours] = useState(6)
  const [status, setStatus] = useState<Pick<WebhookState, 'lastBackupAt' | 'lastResult'> | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await api<{ webhook?: WebhookState | null }>('/api/webhook')
      if (d.webhook) {
        setUrl(d.webhook.url)
        setEnabled(d.webhook.enabled)
        setIntervalHours(Math.max(1, Math.round(d.webhook.backupIntervalMinutes / 60)))
        setStatus({ lastBackupAt: d.webhook.lastBackupAt, lastResult: d.webhook.lastResult })
      }
    } catch {
      // Leave the form at its defaults; saving still works.
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    if (!url.trim()) {
      toast.error('Enter a webhook URL first.')
      return
    }
    // Catch the obvious mistake locally rather than 400ing on the server.
    if (!/^https?:\/\//i.test(url.trim())) {
      toast.error('The URL must start with http:// or https://')
      return
    }
    setSaving(true)
    try {
      await api('/api/webhook', {
        method: 'POST',
        body: JSON.stringify({
          url: url.trim(),
          enabled,
          backupIntervalMinutes: Math.max(15, Math.round(intervalHours * 60)),
        }),
      })
      toast.success('Webhook saved. Backups run on the scheduler cycle.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      const d = await api<{ ok: boolean; counts?: Record<string, number>; error?: string }>(
        '/api/webhook',
        { method: 'POST', body: JSON.stringify({ sendNow: true }) },
      )
      if (d.ok) {
        toast.success(
          `Backup delivered — ${d.counts?.tasks ?? 0} task(s), ${d.counts?.items ?? 0} record(s).`,
        )
        load()
      } else {
        toast.error(d.error || 'Delivery failed.')
      }
    } catch (e) {
      toast.error((e as Error).message || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  const lastOk = status?.lastResult === 'ok'

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2">
        <Webhook className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        <div>
          <Label className="text-sm font-medium">Automatic backup &amp; alerts</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Posts a full workspace backup to your endpoint on a schedule, and pushes a
            message whenever a scheduled run fails. Use S3/R2, n8n, or a script you control.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="webhook-url" className="text-xs block">
          Webhook URL
        </Label>
        <Input
          id="webhook-url"
          type="url"
          placeholder="https://example.com/hooks/intellex"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-2">
          <Label htmlFor="webhook-interval" className="text-xs block">
            Every (hours)
          </Label>
          <Input
            id="webhook-interval"
            type="number"
            min={1}
            max={168}
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value) || 1)}
            className="h-8 w-24 text-xs"
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer pb-1.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input accent-emerald-600"
          />
          Enabled
        </label>
      </div>

      {status?.lastBackupAt && (
        <p className="flex items-center gap-1.5 text-[11px]">
          {lastOk ? (
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
          ) : (
            <ShieldAlert className="h-3 w-3 text-red-500" />
          )}
          <span className="text-muted-foreground">Last attempt</span>
          <span className="font-mono">{new Date(status.lastBackupAt).toLocaleString()}</span>
          {status.lastResult && !lastOk && (
            <span className="text-red-600 dark:text-red-400">— {status.lastResult}</span>
          )}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={test}
          disabled={testing || !url.trim()}
        >
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Back up now
        </Button>
      </div>
    </section>
  )
}