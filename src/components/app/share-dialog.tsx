'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from './shared'

// Creates and revokes read-only share links for a completed collection. The raw
// token is returned exactly once by the API, so it is shown here with a copy
// button and never listed again.

type Link = {
  id: string
  label: string | null
  state: 'active' | 'revoked' | 'expired'
  expiresAt: string | null
  viewCount: number
}

export function ShareDialog({
  open,
  onOpenChange,
  taskId,
  taskTitle,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  taskId: string
  taskTitle: string
}) {
  const [links, setLinks] = useState<Link[]>([])
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ links: Link[] }>(`/api/tasks/${taskId}/share`)
      setLinks(data.links)
    } catch (e) {
      toast.error((e as Error).message || 'Could not load share links')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    if (open) {
      setFreshUrl(null)
      load()
    }
  }, [open, load])

  const create = async () => {
    setBusy(true)
    try {
      const res = await api<{ share: { path: string; expiresAt: string | null }; notice: string }>(
        `/api/tasks/${taskId}/share`,
        { method: 'POST', body: JSON.stringify({ label: label.trim() || undefined }) },
      )
      setFreshUrl(`${window.location.origin}${res.share.path}`)
      setLabel('')
      await load()
    } catch (e) {
      toast.error((e as Error).message || 'Could not create a link')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    try {
      await api(`/api/tasks/${taskId}/share`, { method: 'DELETE', body: JSON.stringify({ shareId: id }) })
      toast.success('Link revoked. It stops working immediately.')
      if (freshUrl) setFreshUrl(null)
      await load()
    } catch (e) {
      toast.error((e as Error).message || 'Could not revoke the link')
    }
  }

  const copy = async () => {
    if (!freshUrl) return
    try {
      await navigator.clipboard.writeText(freshUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Clipboard unavailable — select the link and copy manually.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-emerald-500" /> Share dataset
          </DialogTitle>
          <DialogDescription>
            Anyone with the link can read this dataset — nothing else. Links expire in 30 days and can be revoked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {freshUrl && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Copy this link now — it cannot be shown again.</p>
              <div className="flex gap-2">
                <Input readOnly value={freshUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button size="sm" onClick={copy} className="shrink-0">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <a href={freshUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-emerald-600 hover:underline">
                Open the shared view
              </a>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional, e.g. for a colleague)"
              maxLength={120}
            />
            <Button onClick={create} disabled={busy || loading} className="shrink-0">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Create link
            </Button>
          </div>

          <div className="space-y-2">
            {loading && <p className="text-xs text-muted-foreground">Loading links…</p>}
            {!loading && links.length === 0 && (
              <p className="text-xs text-muted-foreground">No share links yet for “{taskTitle}”.</p>
            )}
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{l.label || 'Untitled link'}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {l.state === 'active' ? (
                      <>
                        {l.viewCount} view{l.viewCount === 1 ? '' : 's'}
                        {l.expiresAt ? ` · expires ${new Date(l.expiresAt).toLocaleDateString()}` : ' · no expiry'}
                      </>
                    ) : (
                      <span className={l.state === 'revoked' ? 'text-red-500' : 'text-amber-600'}>
                        {l.state === 'revoked' ? 'Revoked' : 'Expired'}
                      </span>
                    )}
                  </p>
                </div>
                {l.state === 'active' && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(l.id)} title="Revoke">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}