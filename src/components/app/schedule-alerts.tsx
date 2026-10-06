'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCheck, Loader2, PlayCircle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { api, timeAgo } from './shared'

// Scheduled-run alerts.
//
// The scheduler runs on a 60s interval and fails silently: a broken task flips
// to 'failed' and stays there, with nothing on screen saying so. This surfaces
// unacknowledged failures until someone explicitly clears them, which is what
// stops "the schedule has been broken since Tuesday" going unnoticed.

interface Run {
  id: string
  taskId: string | null
  taskTitle: string | null
  status: string
  message: string
  startedAt: string
  durationMs: number | null
  items: number | null
  sources: number | null
  error: string | null
  unacknowledged: boolean
}

export function ScheduleAlerts({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState<'ack' | 'tick' | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<{ runs: Run[] }>('/api/alerts?limit=25')
      setRuns(d.runs)
    } catch {
      // Non-fatal: the badge simply shows nothing rather than breaking the page.
    }
  }, [])

  useEffect(() => {
    load()
    // Poll while a run may be in flight so the badge resolves on its own.
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const acknowledge = useCallback(async () => {
    setBusy('ack')
    try {
      await api('/api/alerts', { method: 'POST', body: JSON.stringify({}) })
      toast.success('Alerts cleared.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Could not clear alerts')
    } finally {
      setBusy(null)
    }
  }, [load])

  const forceTick = useCallback(async () => {
    setBusy('tick')
    try {
      const d = await api<{ processed: number }>('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ tick: true }),
      })
      toast.success(`Ticked. ${d.processed} scheduled task(s) fired.`)
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Tick failed')
    } finally {
      setBusy(null)
    }
  }, [load])

  const unacked = runs.filter((r) => r.unacknowledged)
  const failed = runs.filter((r) => r.status === 'failed')

  if (runs.length === 0) return null

  return (
    <div className="border-b border-border">
      {unacked.length > 0 && (
        <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                {unacked.length} scheduled run{unacked.length === 1 ? '' : 's'} failed
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                These have not been acknowledged yet.
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
            {unacked.slice(0, 5).map((r) => (
              <li key={r.id} className="text-[11px] leading-snug">
                <span className="font-medium">{r.taskTitle || 'Unknown task'}</span>
                <span className="text-muted-foreground"> · {timeAgo(r.startedAt)}</span>
                {r.error && (
                  <span className="block font-mono text-[10px] text-red-600/80 dark:text-red-400/80 break-words">
                    {r.error.slice(0, 160)}
                  </span>
                )}
              </li>
            ))}
            {unacked.length > 5 && (
              <li className="text-[10px] text-muted-foreground">+{unacked.length - 5} more</li>
            )}
          </ul>
          <Button size="sm" className="w-full h-7 text-[11px]" onClick={acknowledge} disabled={busy !== null}>
            {busy === 'ack' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
            Acknowledge all
          </Button>
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-accent transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-xs font-medium">
          Scheduled runs
          <Badge
            variant="outline"
            className={
              failed.length > 0
                ? 'text-[9px] py-0 px-1.5 border-red-500/30 text-red-600 dark:text-red-400'
                : 'text-[9px] py-0 px-1.5 text-emerald-600 dark:text-emerald-400'
            }
          >
            {failed.length > 0 ? `${failed.length} failed` : 'all healthy'}
          </Badge>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-[11px]"
            onClick={forceTick}
            disabled={busy !== null}
          >
            {busy === 'tick' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
            Run scheduler now
          </Button>
          {runs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No scheduled runs recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    disabled={!r.taskId}
                    onClick={() => r.taskId && onOpenTask(r.taskId)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded px-1.5 py-1 text-left transition-colors',
                      r.taskId && 'hover:bg-accent cursor-pointer',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1 h-1.5 w-1.5 rounded-full shrink-0',
                        r.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500',
                      )}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] font-medium break-words">
                        {r.taskTitle || 'Unknown task'}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {timeAgo(r.startedAt)}
                        {r.items !== null && ` · ${r.items} record(s)`}
                        {r.durationMs !== null && ` · ${(r.durationMs / 1000).toFixed(1)}s`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
