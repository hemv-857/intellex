'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Database,
  Search,
  Download,
  ShieldCheck,
  Inbox,
  Layers,
  Sparkles,
  Loader2,
  Calendar,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api, fmtNum, timeAgo, truncate } from './shared'

interface DatasetRecord {
  id: string
  taskId: string
  taskTitle: string
  title: string | null
  summary: string | null
  confidence: number
  valid: boolean
  data: Record<string, unknown>
  tags: string[]
  fields: any[]
  createdAt: string
}

interface SemanticHit extends DatasetRecord {
  score: number
  recencyScore: number
  matchedTerms: string[]
  contentDate: string | null
}

type SortMode = 'relevance' | 'latest'
type DateRange = 'any' | '7d' | '30d' | '90d' | '365d'

interface TaskMeta {
  id: string
  title: string
  status: string
  tags: string[]
  stats: any
  fields: any[]
  updatedAt: string
}

interface DatasetsProps {
  onOpenTask: (id: string) => void
}

export function Datasets({ onOpenTask }: DatasetsProps) {
  const [records, setRecords] = useState<DatasetRecord[]>([])
  const [tasks, setTasks] = useState<TaskMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [taskFilter, setTaskFilter] = useState<string>('all')
  const [validOnly, setValidOnly] = useState(false)
  const [semantic, setSemantic] = useState(true)
  const [semanticHits, setSemanticHits] = useState<SemanticHit[] | null>(null)
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [expandedTerms, setExpandedTerms] = useState<string[]>([])
  const [sort, setSort] = useState<SortMode>('relevance')
  const [dateRange, setDateRange] = useState<DateRange>('any')

  // Load all records once (for filtering / basic search)
  const load = useCallback(async () => {
    try {
      const data = await api<{ count: number; tasks: TaskMeta[]; records: DatasetRecord[] }>(
        `/api/datasets`,
      )
      setRecords(data.records)
      setTasks(data.tasks)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load datasets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Semantic search — debounce, call the LLM-powered endpoint
  useEffect(() => {
    if (!semantic || !q.trim()) {
      setSemanticHits(null)
      setExpandedTerms([])
      return
    }
    setSemanticLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await api<{ total: number; hits: SemanticHit[] }>(
          '/api/search',
          { method: 'POST', body: JSON.stringify({ q, limit: 200, sort, dateRange }) },
        )
        setSemanticHits(res.hits)
        setExpandedTerms(res.hits?.[0]?.matchedTerms || [])
      } catch (e) {
        toast.error((e as Error).message || 'Semantic search failed')
        setSemanticHits([])
      } finally {
        setSemanticLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [q, semantic, sort, dateRange])

  // When semantic mode is on + there's a query, use semantic hits; otherwise basic substring
  const usingSemantic = semantic && q.trim().length > 0 && semanticHits !== null
  const baseRecords = usingSemantic ? semanticHits! : records

  // Date-range filter helper for non-semantic mode
  const withinRange = (r: DatasetRecord): boolean => {
    if (dateRange === 'any') return true
    const days: Record<Exclude<DateRange, 'any'>, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }
    const d = days[dateRange as Exclude<DateRange, 'any'>]
    const ref = new Date(r.createdAt).getTime()
    if (isNaN(ref)) return false
    return (Date.now() - ref) / (1000 * 60 * 60 * 24) <= d
  }

  const filtered = (baseRecords as (DatasetRecord | SemanticHit)[]).filter((r) => {
    // basic substring filter when not using semantic
    if (!usingSemantic && q.trim()) {
      const blob = `${r.title || ''} ${r.summary || ''} ${JSON.stringify(r.data)} ${r.taskTitle}`.toLowerCase()
      if (!blob.includes(q.toLowerCase())) return false
    }
    if (taskFilter !== 'all' && r.taskId !== taskFilter) return false
    if (validOnly && !r.valid) return false
    if (!usingSemantic && !withinRange(r as DatasetRecord)) return false
    return true
  }).sort((a, b) => {
    // When not using semantic, apply sort by date if 'latest'
    if (!usingSemantic && sort === 'latest') {
      const aDate = new Date((a as SemanticHit).contentDate || a.createdAt).getTime()
      const bDate = new Date((b as SemanticHit).contentDate || b.createdAt).getTime()
      return bDate - aDate
    }
    return 0
  })

  // collect all unique field names across filtered records (cap)
  const fieldSet = new Map<string, number>()
  for (const r of filtered) {
    for (const k of Object.keys(r.data || {})) {
      fieldSet.set(k, (fieldSet.get(k) || 0) + 1)
    }
  }
  const topFields = [...fieldSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k)

  const exportFiltered = (format: 'csv' | 'json') => {
    // export from a single task if filtered, else all
    if (taskFilter !== 'all') {
      window.open(`/api/tasks/${taskFilter}/export?format=${format}`, '_blank')
    } else {
      toast.info('Select a specific task to export its dataset.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-500" /> Datasets Explorer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search, filter, and inspect records across all completed collections.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportFiltered('csv')} disabled={taskFilter === 'all'}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export {taskFilter !== 'all' ? '(CSV)' : ''}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search collected records" value={q} onChange={(e) => setQ(e.target.value)} placeholder={semantic ? "Semantic search — e.g. 'AI funding rounds' or 'remote companies'…" : "Search across all records…"} className="pl-9 bg-card" />
          {semanticLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />
          )}
        </div>
        <Button
          size="sm"
          variant={semantic ? 'default' : 'outline'}
          onClick={() => setSemantic((s) => !s)}
          className={semantic ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white' : 'bg-card'}
          title="Toggle AI-powered semantic search (understands synonyms & related concepts)"
        >
          <Sparkles className={cn('h-3.5 w-3.5 mr-1', semantic && 'animate-pulse')} /> Semantic
        </Button>
        <Select value={taskFilter} onValueChange={setTaskFilter}>
          <SelectTrigger className="w-full sm:w-56 bg-card">
            <SelectValue placeholder="All tasks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tasks ({tasks.length})</SelectItem>
            {tasks.map((t) => (
              <SelectItem key={t.id} value={t.id}>{truncate(t.title, 40)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={validOnly ? 'default' : 'outline'}
          onClick={() => setValidOnly((v) => !v)}
          className={validOnly ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-card'}
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Valid only
        </Button>
      </div>

      {/* Sort + date range row */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="h-8 w-36 bg-card text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="365d">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          <button
            onClick={() => setSort('relevance')}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              sort === 'relevance' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Sparkles className="h-3 w-3" /> Relevance
          </button>
          <button
            onClick={() => setSort('latest')}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              sort === 'latest' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Clock className="h-3 w-3" /> Latest
          </button>
        </div>
      </div>

      {/* Semantic expanded terms */}
      {usingSemantic && expandedTerms.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-emerald-500" />
          <span className="font-medium">AI-expanded:</span>
          {expandedTerms.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
              {t}
            </Badge>
          ))}
          <span className="text-muted-foreground/60 ml-1">· {semanticHits?.length || 0} matched</span>
        </div>
      )}

      {/* Task chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setTaskFilter('all')}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
            taskFilter === 'all' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-card text-muted-foreground hover:bg-accent',
          )}
        >
          <Layers className="h-3 w-3 inline mr-1" /> All ({tasks.length})
        </button>
        {tasks.slice(0, 8).map((t) => (
          <button
            key={t.id}
            onClick={() => setTaskFilter(t.id)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors truncate max-w-44',
              taskFilter === t.id ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {t.title}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
              {usingSemantic ? <Sparkles className="h-6 w-6 text-emerald-500" /> : <Inbox className="h-6 w-6 text-muted-foreground" />}
            </div>
            <p className="text-sm font-medium">{usingSemantic ? 'No semantic matches' : 'No records found'}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {usingSemantic ? 'Try a different query or turn off Semantic to use basic search.' : q || taskFilter !== 'all' ? 'Try adjusting your filters.' : 'Run a collection to start building datasets.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              {usingSemantic ? (
                <>
                  {sort === 'latest' ? (
                    <><Clock className="h-3 w-3 text-emerald-500" /> Latest first — newest content dated till today</>
                  ) : (
                    <><Sparkles className="h-3 w-3 text-emerald-500" /> Ranked by AI relevance + recency</>
                  )}
                </>
              ) : (
                sort === 'latest'
                  ? <><Clock className="h-3 w-3 text-muted-foreground" /> Latest first ({fmtNum(filtered.length)})</>
                  : `Records (${fmtNum(filtered.length)})`
              )}
              {dateRange !== 'any' && (
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 ml-1">
                  {dateRange === '7d' ? '7d' : dateRange === '30d' ? '30d' : dateRange === '90d' ? '90d' : '1yr'}
                </Badge>
              )}
            </span>
            <span className="text-[11px] text-muted-foreground">showing {Math.min(filtered.length, 200)}</span>
          </div>
          {filtered.slice(0, 200).map((r, i) => {
            const hit = r as SemanticHit
            const score = hit.score
            return (
              <Card key={r.id} className="hover:shadow-sm hover:border-emerald-500/30 transition-all">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    {/* rank / score */}
                    <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      <span className="text-[10px] font-mono text-muted-foreground/50">{i + 1}</span>
                      {usingSemantic && score > 0 && (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{score}</span>
                          <div className="h-8 w-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="w-full rounded-full bg-gradient-to-t from-emerald-500 to-teal-400"
                              style={{ height: `${Math.min(100, score * 4)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold leading-snug break-words">{r.title || 'Untitled'}</h4>
                        {!r.valid && <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 shrink-0">invalid</Badge>}
                      </div>
                      {r.summary && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 break-words">{r.summary}</p>}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
                        {topFields.map((f) => {
                          const v = r.data[f]
                          if (v === undefined || v === null || v === '') return null
                          return (
                            <div key={f} className="flex gap-1.5 min-w-0 items-baseline">
                              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{f}:</span>
                              <span className="text-[11px] font-mono text-foreground/80 break-words min-w-0">{String(v)}</span>
                            </div>
                          )
                        })}
                      </div>
                      {usingSemantic && hit.matchedTerms?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mt-2">
                          <span className="text-[9px] text-muted-foreground/60">matched:</span>
                          {hit.matchedTerms.slice(0, 6).map((t) => (
                            <Badge key={t} variant="outline" className="text-[9px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* meta */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {hit.contentDate && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          <span className="font-medium tabular-nums">{new Date(hit.contentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                        </div>
                      )}
                      <button
                        onClick={() => onOpenTask(r.taskId)}
                        className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline truncate max-w-[8rem] text-right"
                        title={r.taskTitle}
                      >
                        {truncate(r.taskTitle, 20)}
                      </button>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {r.tags.slice(0, 2).map((t) => (
                          <Badge key={t} variant="outline" className="text-[9px] py-0 px-1 bg-muted/40">{t}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="h-1 w-10 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full', r.confidence >= 75 ? 'bg-emerald-500' : r.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                            style={{ width: `${r.confidence}%` }}
                          />
                        </div>
                        <span className="text-[9px] tabular-nums text-muted-foreground">{r.confidence}%</span>
                      </div>
                      <span className="text-[9px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
