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
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

  const load = useCallback(async () => {
    try {
      const data = await api<{ count: number; tasks: TaskMeta[]; records: DatasetRecord[] }>(
        `/api/datasets?q=${encodeURIComponent(q)}`,
      )
      setRecords(data.records)
      setTasks(data.tasks)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load datasets')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const filtered = records.filter((r) => {
    if (taskFilter !== 'all' && r.taskId !== taskFilter) return false
    if (validOnly && !r.valid) return false
    return true
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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search across all records…" className="pl-9 bg-card" />
        </div>
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
          className={validOnly ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Valid only
        </Button>
      </div>

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
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No records found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {q || taskFilter !== 'all' ? 'Try adjusting your filters.' : 'Run a collection to start building datasets.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Records ({fmtNum(filtered.length)})</CardTitle>
            <span className="text-[11px] text-muted-foreground">showing first {Math.min(filtered.length, 500)}</span>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[36rem] scrollbar-thin">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead className="w-24 text-right">Conf.</TableHead>
                      <TableHead>Collection</TableHead>
                      <TableHead className="w-20">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 500).map((r, i) => (
                      <TableRow key={r.id} className="hover:bg-accent/40">
                        <TableCell className="text-muted-foreground text-xs font-mono">{i + 1}</TableCell>
                        <TableCell className="max-w-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{r.title || 'Untitled'}</span>
                            {!r.valid && <Badge variant="outline" className="text-[9px] py-0 px-1 bg-red-500/10 text-red-600 border-red-500/20">invalid</Badge>}
                          </div>
                          {r.summary && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{r.summary}</div>}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {topFields.map((f) => {
                              const v = r.data[f]
                              if (v === undefined || v === null || v === '') return null
                              return (
                                <span key={f} className="text-[10px] text-muted-foreground">
                                  <span className="text-muted-foreground/60">{f}:</span>{' '}
                                  <span className="text-foreground/80 font-mono">{truncate(String(v), 32)}</span>
                                </span>
                              )
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className={cn('text-[11px] tabular-nums font-medium', r.confidence >= 75 ? 'text-emerald-600 dark:text-emerald-400' : r.confidence >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                              {r.confidence}%
                            </span>
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full rounded-full', r.confidence >= 75 ? 'bg-emerald-500' : r.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                                style={{ width: `${r.confidence}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => onOpenTask(r.taskId)}
                            className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline truncate max-w-[10rem] block text-left"
                            title={r.taskTitle}
                          >
                            {r.taskTitle}
                          </button>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {r.tags.slice(0, 2).map((t) => (
                              <Badge key={t} variant="outline" className="text-[9px] py-0 px-1 bg-muted/40">{t}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{timeAgo(r.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
