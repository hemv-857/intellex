'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, ShieldCheck, ShieldX, Save, X, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { api, type DataItemView } from './shared'

// Per-record correction UI.
//
// The collector is the weakest link in the pipeline: it guesses values from page
// prose and a wrong field can only previously be fixed by deleting the source
// and re-running, which costs a Tavily credit and an extraction call and can
// reproduce the same mistake. This lets a human fix one field in place.
//
// Only the task's declared fields are editable — the API rejects anything else,
// so a schema field cannot be smuggled in here.

interface Props {
  taskId: string
  item: DataItemView
  fields: Array<{ name: string; type?: string; description?: string }>
  sources: Array<{ id: string; url: string; hostName?: string | null; favicon?: string | null }>
  onChanged: () => void
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function RecordEditor({ taskId, item, fields, sources, onChanged }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const savingRef = useRef(false)

  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const src = item.sourceId ? sourceMap.get(item.sourceId) : null

  // Start every declared field, not just the populated ones: an empty required
  // field is exactly what a human most often needs to fill in.
  const startEdit = useCallback(() => {
    const next: Record<string, string> = {}
    for (const f of fields) {
      const v = item.data?.[f.name]
      next[f.name] = v === undefined || v === null ? '' : String(v)
    }
    setDraft(next)
    setEditing(true)
  }, [fields, item.data])

  const cancel = useCallback(() => {
    setEditing(false)
    setDraft({})
  }, [])

  const save = useCallback(async () => {
    // Guards a double-submit from two rapid clicks, which would otherwise fire
    // two PATCHes and log two activity entries for one edit.
    if (savingRef.current) return
    savingRef.current = true
    setBusy(true)

    // Only send what actually changed, so the server's activity log names the
    // edited fields rather than every field in the record.
    const changed: Record<string, string> = {}
    for (const [k, v] of Object.entries(draft)) {
      const before = item.data?.[k]
      const beforeStr = before === undefined || before === null ? '' : String(before)
      if (v !== beforeStr) changed[k] = v
    }

    if (Object.keys(changed).length === 0) {
      cancel()
      savingRef.current = false
      setBusy(false)
      return
    }

    try {
      await api(`/api/tasks/${taskId}/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: changed }),
      })
      toast.success('Record updated.')
      setEditing(false)
      setDraft({})
      onChanged()
    } catch (e) {
      toast.error((e as Error).message || 'Could not save changes')
    } finally {
      savingRef.current = false
      setBusy(false)
    }
  }, [cancel, draft, item.data, item.id, onChanged, taskId])

  const toggleValid = useCallback(async () => {
    setBusy(true)
    try {
      await api(`/api/tasks/${taskId}/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ valid: !item.valid }),
      })
      toast.success(item.valid ? 'Marked invalid.' : 'Marked valid.')
      onChanged()
    } catch (e) {
      toast.error((e as Error).message || 'Could not update')
    } finally {
      setBusy(false)
    }
  }, [item.id, item.valid, onChanged, taskId])

  const remove = useCallback(async () => {
    setBusy(true)
    try {
      await api(`/api/tasks/${taskId}/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ delete: true }),
      })
      toast.success('Record deleted.')
      onChanged()
    } catch (e) {
      toast.error((e as Error).message || 'Could not delete')
    } finally {
      setBusy(false)
    }
  }, [item.id, onChanged, taskId])

  if (editing) {
    return (
      <Card className="border-amber-500/40">
        <CardContent className="p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Editing record</span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={cancel}
                disabled={busy}
                aria-label="Cancel editing"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-7" onClick={save} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fields.map((f) => (
              <label key={f.name} className="flex flex-col gap-1 min-w-0">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {f.name}
                  {f.type ? ` (${f.type})` : ''}
                </span>
                <Input
                  aria-label={`Edit ${f.name}`}
                  value={draft[f.name] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                  className="h-8 text-xs font-mono"
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="hover:shadow-sm hover:border-emerald-500/30 transition-all">
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
            <div className="h-10 w-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  item.confidence >= 75
                    ? 'w-full rounded-full bg-emerald-500'
                    : item.confidence >= 50
                      ? 'w-full rounded-full bg-amber-500'
                      : 'w-full rounded-full bg-red-500'
                }
                style={{ height: `${item.confidence}%` }}
              />
            </div>
            <span className="text-[9px] tabular-nums font-semibold">{item.confidence}%</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h4 className="text-sm font-semibold leading-snug break-words">{item.title || 'Untitled'}</h4>
              {!item.valid && (
                <Badge
                  variant="outline"
                  className="text-[9px] py-0 px-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 shrink-0"
                >
                  invalid
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
              {fields.map((f) => {
                const v = item.data?.[f.name]
                if (v === undefined || v === null || v === '') return null
                return (
                  <div key={f.name} className="flex gap-1.5 min-w-0 items-baseline">
                    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{f.name}:</span>
                    <span className="text-[11px] font-mono text-foreground/80 break-words min-w-0">{String(v)}</span>
                  </div>
                )
              })}
            </div>

            {/* Actions sit under the record rather than in the card's top-right
                corner, so they never crowd the confidence bar on narrow screens. */}
            <div className="flex items-center gap-1.5 mt-2.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={startEdit}
                disabled={busy}
              >
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={toggleValid}
                disabled={busy}
                aria-label={item.valid ? `Mark "${item.title || 'record'}" invalid` : `Mark "${item.title || 'record'}" valid`}
              >
                {item.valid ? <ShieldX className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {item.valid ? 'Invalid' : 'Valid'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-muted-foreground hover:text-red-600"
                onClick={remove}
                disabled={busy}
                aria-label={`Delete record "${item.title || 'Untitled'}"`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>

              {src && (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 hover:underline truncate ml-auto max-w-[10rem]"
                  title={src.url}
                >
                  {src.favicon && (
                    <img
                      src={src.favicon}
                      alt=""
                      className="h-3 w-3 rounded-sm shrink-0"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  )}
                  <span className="truncate">{src.hostName || hostFromUrl(src.url)}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}