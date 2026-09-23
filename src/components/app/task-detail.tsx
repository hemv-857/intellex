'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Rocket,
  Loader2,
  Download,
  Trash2,
  Database,
  Globe,
  ShieldCheck,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  Search,
  Quote,
  Sparkles,
  Target,
  Tag,
  Clock,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  api,
  type TaskDetail,
  type DataSourceView,
  type DataItemView,
  type WorkflowStep,
  StatusBadge,
  statusDotClass,
  fmtNum,
  fmtDate,
  timeAgo,
  hostFromUrl,
  truncate,
} from './shared'

interface TaskDetailProps {
  taskId: string
  onBack: () => void
  onDelete: () => void
}

export function TaskDetailView({ taskId, onBack, onDelete }: TaskDetailProps) {
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [sources, setSources] = useState<DataSourceView[]>([])
  const [items, setItems] = useState<DataItemView[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<{ task: TaskDetail; sources: DataSourceView[]; items: DataItemView[] }>(`/api/tasks/${taskId}`)
      setTask(data.task)
      setSources(data.sources)
      setItems(data.items)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load task')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // poll while running
  useEffect(() => {
    if (task?.status !== 'running') return
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [task?.status, load])

  const handleRun = async () => {
    setRunning(true)
    try {
      await api(`/api/tasks/${taskId}/run`, { method: 'POST' })
      toast.success('Collection started.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to start')
    } finally {
      setRunning(false)
    }
  }

  const handleDelete = async () => {
    try {
      await api(`/api/tasks/${taskId}`, { method: 'DELETE' })
      toast.success('Task deleted.')
      onDelete()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete')
    }
  }

  const handleExport = (format: 'csv' | 'json') => {
    window.open(`/api/tasks/${taskId}/export?format=${format}`, '_blank')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!task) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-sm text-muted-foreground">Task not found.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>Back to tasks</Button>
        </CardContent>
      </Card>
    )
  }

  const stats = task.stats || {}
  const isRunning = task.status === 'running'

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to tasks
        </Button>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={items.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={handleRun} disabled={isRunning || running} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white">
            {isRunning || running ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running…</> : <><Rocket className="h-3.5 w-3.5 mr-1.5" /> {task.status === 'planned' ? 'Run Collection' : 'Re-run'}</>}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-muted-foreground hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes the task and all its records and sources.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Header card */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={task.status} />
                {task.tags.map((t) => (
                  <Badge key={t} variant="outline" className="bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
                    <Tag className="h-2.5 w-2.5 mr-1" /> {t}
                  </Badge>
                ))}
                <span className="text-[11px] text-muted-foreground">created {timeAgo(task.createdAt)}</span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">{task.title}</h1>
              {task.objective && (
                <p className="text-sm text-muted-foreground flex items-start gap-1.5">
                  <Target className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                  <span>{task.objective}</span>
                </p>
              )}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                  <Sparkles className="h-3 w-3 text-emerald-500" /> ORIGINAL PROMPT
                </div>
                <p className="text-xs font-mono text-foreground/80 leading-relaxed">{task.prompt}</p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:w-56 shrink-0">
              <StatPill icon={Database} label="Records" value={fmtNum(stats.items ?? items.length)} tint="text-emerald-600 dark:text-emerald-400" />
              <StatPill icon={Globe} label="Sources" value={fmtNum(stats.sources ?? sources.length)} tint="text-sky-600 dark:text-sky-400" />
              <StatPill icon={ShieldCheck} label="Valid" value={fmtNum(stats.valid ?? items.filter(i => i.valid).length)} tint="text-teal-600 dark:text-teal-400" />
              <StatPill icon={RefreshCw} label="Duplicates" value={fmtNum(stats.duplicates ?? 0)} tint="text-amber-600 dark:text-amber-400" />
              <StatPill icon={Zap} label="Tokens" value={fmtNum(stats.tokens ?? 0)} tint="text-violet-600 dark:text-violet-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Loader2 className={cn('h-4 w-4 text-emerald-500', isRunning && 'animate-spin')} /> Workflow Execution
          </CardTitle>
          <CardDescription>
            {isRunning && task.progress?.message ? task.progress.message : 'Pipeline that produced this dataset'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col sm:flex-row gap-2">
            {task.workflow.map((step, i) => (
              <WorkflowStepCard key={step.id} step={step} isLast={i === task.workflow.length - 1} />
            ))}
          </div>
          {isRunning && task.progress && task.progress.total ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>{task.progress.message}</span>
                <span>{task.progress.current} / {task.progress.total}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                  style={{ width: `${Math.min(100, ((task.progress.current || 0) / (task.progress.total || 1)) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
          {task.error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div className="text-xs text-red-600 dark:text-red-400">
                <p className="font-medium">Execution failed</p>
                <p className="text-red-500/80 mt-0.5 break-words">{task.error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: data, sources, schema */}
      <Tabs defaultValue="data">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="data" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400">
            <Database className="h-3.5 w-3.5 mr-1.5" /> Data ({items.length})
          </TabsTrigger>
          <TabsTrigger value="sources" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400">
            <Globe className="h-3.5 w-3.5 mr-1.5" /> Sources ({sources.length})
          </TabsTrigger>
          <TabsTrigger value="schema" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Schema
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="mt-3">
          <DataTab items={items} fields={task.fields} sources={sources} />
        </TabsContent>

        <TabsContent value="sources" className="mt-3">
          <SourcesTab sources={sources} />
        </TabsContent>

        <TabsContent value="schema" className="mt-3">
          <SchemaTab task={task} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatPill({ icon: Icon, label, value, tint }: { icon: any; label: string; value: string; tint: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={cn('h-4 w-4', tint)} />
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  )
}

function WorkflowStepCard({ step, isLast }: { step: WorkflowStep; isLast: boolean }) {
  const Icon =
    step.status === 'completed' ? CheckCircle2 : step.status === 'running' ? Loader2 : step.status === 'failed' ? AlertCircle : CircleDashed
  const tint =
    step.status === 'completed'
      ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5'
      : step.status === 'running'
      ? 'text-amber-500 border-amber-500/30 bg-amber-500/5'
      : step.status === 'failed'
      ? 'text-red-500 border-red-500/30 bg-red-500/5'
      : 'text-muted-foreground border-border bg-muted/20'
  return (
    <div className={cn('relative flex-1 min-w-0 rounded-lg border p-3', tint)}>
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', step.status === 'running' && 'animate-spin')} />
        <span className="text-xs font-medium truncate">{step.name}</span>
      </div>
      {step.detail && <p className="text-[10px] text-muted-foreground mt-1 truncate">{step.detail}</p>}
      {!isLast && <div className="hidden sm:block absolute -right-1.5 top-1/2 -translate-y-1/2 h-px w-3 bg-border z-10" />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data tab
// ---------------------------------------------------------------------------

function DataTab({ items, fields, sources }: { items: DataItemView[]; fields: any[]; sources: DataSourceView[] }) {
  const [q, setQ] = useState('')
  const [validOnly, setValidOnly] = useState(false)

  const fieldNames = fields.map((f) => f.name)
  const filtered = items.filter((it) => {
    if (validOnly && !it.valid) return false
    if (!q) return true
    const blob = (it.title + ' ' + it.summary + ' ' + JSON.stringify(it.data)).toLowerCase()
    return blob.includes(q.toLowerCase())
  })

  const sourceMap = new Map(sources.map((s) => [s.id, s]))

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
            <Database className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No records yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">Run the collection to extract structured records from the web.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records…" className="pl-9 h-9 bg-card" />
          </div>
          <Button
            size="sm"
            variant={validOnly ? 'default' : 'outline'}
            onClick={() => setValidOnly((v) => !v)}
            className={validOnly ? 'bg-emerald-600 hover:bg-emerald-700 text-white h-9' : 'h-9 bg-card'}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Valid only
          </Button>
        </div>
        <span className="text-[11px] text-muted-foreground">{filtered.length} of {items.length}</span>
      </div>

      {/* Record cards */}
      <div className="grid gap-2.5">
        {filtered.map((it, idx) => {
          const src = it.sourceId ? sourceMap.get(it.sourceId) : null
          return (
            <Card key={it.id} className="hover:shadow-sm hover:border-emerald-500/30 transition-all">
              <CardContent className="p-3.5">
                <div className="flex items-start gap-3">
                  {/* Index + confidence */}
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                      <span className="text-[10px] font-mono text-muted-foreground/50">{idx + 1}</span>
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="h-10 w-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'w-full rounded-full transition-all',
                              it.confidence >= 75 ? 'bg-emerald-500' : it.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500',
                            )}
                            style={{ height: `${it.confidence}%` }}
                          />
                        </div>
                        <span className={cn(
                          'text-[9px] tabular-nums font-semibold',
                          it.confidence >= 75 ? 'text-emerald-600 dark:text-emerald-400' : it.confidence >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
                        )}>
                          {it.confidence}%
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold leading-snug break-words">
                          {it.title || 'Untitled'}
                        </h4>
                        {!it.valid && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 shrink-0">
                            invalid
                          </Badge>
                        )}
                      </div>
                      {it.summary && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 break-words">
                          {it.summary}
                        </p>
                      )}
                      {/* Field values */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
                        {fieldNames.map((f) => {
                          const v = it.data[f]
                          if (v === undefined || v === null || v === '') return null
                          return (
                            <div key={f} className="flex gap-1.5 min-w-0 items-baseline">
                              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{f}:</span>
                              <span className="text-[11px] font-mono text-foreground/80 break-words min-w-0">
                                {String(v)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Source */}
                    {src && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 hover:underline shrink-0 max-w-[8rem] mt-0.5"
                        title={src.url}
                      >
                        {src.favicon && (
                          <img src={src.favicon} alt="" className="h-3 w-3 rounded-sm shrink-0" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                        )}
                        <span className="truncate">{src.hostName || hostFromUrl(src.url)}</span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sources tab
// ---------------------------------------------------------------------------

function SourcesTab({ sources }: { sources: DataSourceView[] }) {
  if (sources.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
            <Globe className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No sources collected</p>
          <p className="text-xs text-muted-foreground mt-1">Sources appear once the collection searches the web.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-2">
      {sources.map((s) => {
        const statusTint =
          s.fetchStatus === 'fetched'
            ? 'text-emerald-500 bg-emerald-500/10'
            : s.fetchStatus === 'failed'
            ? 'text-red-500 bg-red-500/10'
            : 'text-amber-500 bg-amber-500/10'
        const statusLabel = s.fetchStatus === 'fetched' ? 'Read' : s.fetchStatus === 'failed' ? 'Failed' : 'Pending'
        return (
          <Card key={s.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-3.5">
              <div className="flex items-start gap-3">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {s.favicon ? (
                    <img src={s.favicon} alt="" className="h-4 w-4 rounded-sm" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                  ) : (
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-emerald-600 dark:hover:text-emerald-400 truncate max-w-full">
                      {s.title || hostFromUrl(s.url)}
                    </a>
                    <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5', statusTint)}>{statusLabel}</Badge>
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
                    <span>{s.hostName}</span>
                    {s.publishedTime && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{fmtDate(s.publishedTime)}</span>}
                    {s.fetchedAt && <span>read {timeAgo(s.fetchedAt)}</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schema tab
// ---------------------------------------------------------------------------

function SchemaTab({ task }: { task: TaskDetail }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-teal-500" /> Target Schema
          </CardTitle>
          <CardDescription>Structured fields extracted per record</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1.5">
            {task.fields.map((f) => (
              <div key={f.name} className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">{f.name}</code>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-muted-foreground">{f.type}</Badge>
                    {f.required && <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">required</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {task.validationRules.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Validation Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {task.validationRules.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                  <span className="text-muted-foreground">{r}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-sky-500" /> Search Queries Used
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5">
          {task.searchQueries.map((q, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg bg-sky-500/5 border border-sky-500/15 px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-[10px] font-semibold text-sky-600 dark:text-sky-400">{i + 1}</span>
              <code className="text-xs text-foreground/80 break-all">{q}</code>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
