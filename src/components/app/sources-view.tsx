'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Globe,
  Search,
  ExternalLink,
  Quote,
  Clock,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api, fmtNum, fmtDate, timeAgo, hostFromUrl, truncate } from './shared'
import { RefreshCcwDot } from 'lucide-react'

interface SourceRow {
  id: string
  url: string
  title: string | null
  snippet: string | null
  hostName: string | null
  favicon: string | null
  publishedTime: string | null
  fetchStatus: 'pending' | 'fetched' | 'failed'
  tokensUsed: number
  contentExcerpt: string | null
  fetchedAt: string | null
  taskId: string
  taskTitle: string
}

interface SourcesViewProps {
  onOpenTask: (id: string) => void
}

export function SourcesView({ onOpenTask }: SourcesViewProps) {
  const [sources, setSources] = useState<SourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reExtractId, setReExtractId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'fetched' | 'failed' | 'pending'>('all')

  const load = useCallback(async () => {
    try {
      const data = await api<{ sources: SourceRow[] }>(`/api/sources?q=${encodeURIComponent(q)}&status=${status}`)
      setSources(data.sources)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load sources')
    } finally {
      setLoading(false)
    }
  }, [q, status])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const reExtracting = reExtractId

  const handleReExtract = async (s: SourceRow) => {
    setReExtractId(s.id)
    try {
      const res = await api<{ message: string; records: number; previousRecords: number }>(
        `/api/sources/${s.id}/re-extract`,
        { method: 'POST' },
      )
      if (res.records > 0 || !res.message.includes('left untouched')) {
        toast.success(res.message)
      } else {
        toast.info(res.message)
      }
      await load()
    } catch (e) {
      toast.error((e as Error).message || 'Re-extraction failed')
    } finally {
      setReExtractId(null)
    }
  }

  // group by host
  const byHost = new Map<string, SourceRow[]>()
  for (const s of sources) {
    const h = s.hostName || hostFromUrl(s.url)
    if (!byHost.has(h)) byHost.set(h, [])
    byHost.get(h)!.push(s)
  }
  const hosts = [...byHost.entries()].sort((a, b) => b[1].length - a[1].length)

  const fetchedCount = sources.filter((s) => s.fetchStatus === 'fetched').length
  const failedCount = sources.filter((s) => s.fetchStatus === 'failed').length

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-5 w-5 text-sky-500" /> Sources Registry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sources.length} sources traced across collections · {fetchedCount} read · {failedCount} failed
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by URL, title, host…" className="pl-9 bg-card" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-full sm:w-40 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="fetched">Read</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
              <Globe className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No sources yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">Sources are gathered when you run a collection task.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Host groups */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {hosts.slice(0, 6).map(([host, items]) => (
              <Card key={host} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3">
                  <div className="text-[11px] text-muted-foreground truncate">{host}</div>
                  <div className="text-lg font-bold mt-0.5">{fmtNum(items.length)}</div>
                  <div className="text-[10px] text-muted-foreground">source{items.length !== 1 ? 's' : ''}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Source list */}
          <ScrollArea className="max-h-[40rem] scrollbar-thin">
            <div className="space-y-2 pr-2">
              {sources.map((s) => {
                const tint =
                  s.fetchStatus === 'fetched'
                    ? 'text-emerald-500 bg-emerald-500/10'
                    : s.fetchStatus === 'failed'
                    ? 'text-red-500 bg-red-500/10'
                    : 'text-amber-500 bg-amber-500/10'
                return (
                  <Card key={s.id} className="hover:shadow-sm hover:border-sky-500/30 transition-all">
                    <CardContent className="p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {s.favicon ? (
                            <img src={s.favicon} alt="" className="h-4 w-4 rounded-sm" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                          ) : (
                            <Globe className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-sky-600 dark:hover:text-sky-400 truncate max-w-full">
                              {s.title || hostFromUrl(s.url)}
                            </a>
                            <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5', tint)}>
                              {s.fetchStatus === 'fetched' ? <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> : s.fetchStatus === 'failed' ? <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> : <Loader2 className="h-2.5 w-2.5 mr-0.5" />}
                              {s.fetchStatus}
                            </Badge>
                            {s.tokensUsed > 0 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />{fmtNum(s.tokensUsed)}</span>}
                          </div>
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-600 dark:text-sky-400 truncate block hover:underline">
                            {s.url}
                          </a>
                          {s.snippet && (
                            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                              <Quote className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50" />
                              <span className="line-clamp-2">{s.snippet}</span>
                            </div>
                          )}
                          {s.contentExcerpt && (
                            <div className="mt-1 text-[11px] text-muted-foreground/80 italic">{s.contentExcerpt}</div>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                            <button onClick={() => onOpenTask(s.taskId)} className="hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline">
                              {truncate(s.taskTitle, 40)}
                            </button>
                            {s.publishedTime && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{fmtDate(s.publishedTime)}</span>}
                            {s.fetchedAt && <span>read {timeAgo(s.fetchedAt)}</span>}
                            <button
                              onClick={() => handleReExtract(s)}
                              disabled={reExtracting === s.id}
                              title="Re-read this page and re-extract its records"
                              className="flex items-center gap-0.5 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-50"
                            >
                              {reExtracting === s.id
                                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                : <RefreshCcwDot className="h-2.5 w-2.5" />}
                              re-extract
                            </button>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-0.5 hover:text-foreground">
                              open <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
