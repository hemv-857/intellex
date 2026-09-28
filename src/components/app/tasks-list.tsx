'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Search,
  Database,
  Globe,
  Sparkles,
  Loader2,
  Trash2,
  Rocket,
  ListChecks,
  RefreshCw,
  Inbox,
  Pin,
  PinOff,
  RotateCcw,
  CheckSquare,
  Square,
  Trash,
  GitCompare,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { api, type TaskListItem, type TaskStatus, StatusBadge, statusDotClass, QualityBadge, fmtNum, timeAgo, truncate } from './shared'

interface TasksListProps {
  onOpenTask: (id: string) => void
  onNew: () => void
}

const STATUS_FILTERS: { value: 'all' | TaskStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

export function TasksList({ onOpenTask, onNew }: TasksListProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | TaskStatus>('all')
  const [view, setView] = useState<'active' | 'trash'>('active')
  const [sort, setSort] = useState<'default' | 'quality' | 'records' | 'recent'>('default')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const trashed = view === 'trash' ? '&trashed=true' : ''
      const data = await api<{ tasks: TaskListItem[] }>(`/api/tasks?status=${status}&q=${encodeURIComponent(q)}${trashed}`)
      setTasks(data.tasks)
      setSelected(new Set()) // clear selection on reload
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [q, status, view])

  useEffect(() => {
    setLoading(true)
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // poll while there are running tasks
  useEffect(() => {
    const running = tasks.filter((t) => t.status === 'running')
    if (running.length === 0) return
    const ids = new Set(running.map((t) => t.id))
    setRunningIds(ids)
    const interval = setInterval(load, 2500)
    return () => clearInterval(interval)
  }, [tasks, load])

  const handleRun = async (id: string) => {
    try {
      await api(`/api/tasks/${id}/run`, { method: 'POST' })
      toast.success('Collection started.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to start')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/tasks/${id}`, { method: 'DELETE' })
      toast.success('Moved to trash.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete')
    }
  }

  const handlePin = async (id: string, pinned: boolean) => {
    try {
      await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ pinned }) })
      toast.success(pinned ? 'Pinned to top.' : 'Unpinned.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to pin')
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ restore: true }) })
      toast.success('Restored from trash.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to restore')
    }
  }

  const handlePurge = async (id: string) => {
    try {
      await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ purge: true }) })
      toast.success('Permanently deleted.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to purge')
    }
  }

  const handleBulk = async (action: 'delete' | 'purge' | 'restore' | 'pin' | 'unpin') => {
    if (selected.size === 0) return
    try {
      const res = await api<{ affected: number }>(`/api/tasks/bulk`, {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected], action }),
      })
      toast.success(`${res.affected} task(s) ${action === 'delete' ? 'moved to trash' : action === 'purge' ? 'permanently deleted' : action === 'restore' ? 'restored' : action === 'pin' ? 'pinned' : 'unpinned'}.`)
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Bulk operation failed')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((s) => (s.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id))))
  }

  const runningCount = tasks.filter((t) => t.status === 'running').length
  const sortFn = (a: TaskListItem, b: TaskListItem) => {
    if (sort === 'quality') return (b.qualityScore || 0) - (a.qualityScore || 0)
    if (sort === 'records') return (b.itemCount || 0) - (a.itemCount || 0)
    if (sort === 'recent') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return 0 // default = server order (pinned then createdAt)
  }
  const pinnedTasks = tasks.filter((t) => t.pinned).sort(sortFn)
  const unpinnedTasks = tasks.filter((t) => !t.pinned).sort(sortFn)

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-emerald-500" /> {view === 'trash' ? 'Trash' : 'Collection Tasks'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}{view === 'active' && runningCount > 0 && ` · ${runningCount} running`}
            {view === 'active' && pinnedTasks.length > 0 && ` · ${pinnedTasks.length} pinned`}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            <button
              onClick={() => setView('active')}
              className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors', view === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground')}
            >
              <ListChecks className="h-3 w-3" /> Active
            </button>
            <button
              onClick={() => setView('trash')}
              className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors', view === 'trash' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'text-muted-foreground hover:text-foreground')}
            >
              <Trash className="h-3 w-3" /> Trash
            </button>
          </div>
          {view === 'active' && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('intellex:open-compare'))} title="Compare two tasks side-by-side">
                <GitCompare className="h-4 w-4 mr-1.5" /> Compare
              </Button>
              <Button onClick={onNew} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Sparkles className="h-4 w-4 mr-1.5" /> New Collection
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks by title, prompt, or objective…"
            className="pl-9 bg-card"
          />
        </div>
        {view === 'active' && (
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-full sm:w-40 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {view === 'active' && (
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-full sm:w-40 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="quality">Quality score</SelectItem>
              <SelectItem value="records">Most records</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 animate-fade-in-up sticky top-20 z-20 backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-emerald-500" />
            <span className="font-medium">{selected.size} selected</span>
          </div>
          <div className="flex gap-1.5">
            {view === 'active' ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => handleBulk('pin')} className="h-7 text-xs">
                  <Pin className="h-3 w-3 mr-1" /> Pin all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBulk('unpin')} className="h-7 text-xs">
                  <PinOff className="h-3 w-3 mr-1" /> Unpin
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBulk('delete')} className="h-7 text-xs text-red-600 hover:text-red-700">
                  <Trash2 className="h-3 w-3 mr-1" /> Move to trash
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => handleBulk('restore')} className="h-7 text-xs text-emerald-600">
                  <RotateCcw className="h-3 w-3 mr-1" /> Restore
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBulk('purge')} className="h-7 text-xs text-red-600 hover:text-red-700">
                  <Trash2 className="h-3 w-3 mr-1" /> Delete forever
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-7 text-xs">
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 mb-4">
              {view === 'trash' ? <Trash className="h-7 w-7 text-red-500" /> : <Inbox className="h-7 w-7 text-emerald-500" />}
            </div>
            <p className="text-sm font-medium">{view === 'trash' ? 'Trash is empty' : 'No tasks found'}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {view === 'trash' ? 'Deleted tasks will appear here for 30 days before permanent removal.' : q || status !== 'all' ? 'Try adjusting your filters.' : 'Start by creating a new data collection.'}
            </p>
            {view === 'active' && !q && status === 'all' && (
              <Button onClick={onNew} size="sm" className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Sparkles className="h-4 w-4 mr-1.5" /> New Collection
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Select all row */}
          {tasks.length > 0 && (
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-1">
              {selected.size === tasks.length && selected.size > 0 ? <CheckSquare className="h-3.5 w-3.5 text-emerald-500" /> : <Square className="h-3.5 w-3.5" />}
              {selected.size === tasks.length && selected.size > 0 ? 'Deselect all' : 'Select all'}
            </button>
          )}

          {/* Pinned section */}
          {view === 'active' && pinnedTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1">
                <Pin className="h-3 w-3" /> Pinned
              </div>
              {pinnedTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  view={view}
                  selected={selected.has(t.id)}
                  onToggleSelect={() => toggleSelect(t.id)}
                  onOpen={() => onOpenTask(t.id)}
                  onRun={() => handleRun(t.id)}
                  onDelete={() => handleDelete(t.id)}
                  onPin={(p) => handlePin(t.id, p)}
                  onRestore={() => handleRestore(t.id)}
                  onPurge={() => handlePurge(t.id)}
                />
              ))}
            </div>
          )}

          {/* Unpinned / trash section */}
          <div className="space-y-2">
            {view === 'active' && pinnedTasks.length > 0 && unpinnedTasks.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 pt-2">
                <ListChecks className="h-3 w-3" /> All tasks
              </div>
            )}
            {unpinnedTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                view={view}
                selected={selected.has(t.id)}
                onToggleSelect={() => toggleSelect(t.id)}
                onOpen={() => onOpenTask(t.id)}
                onRun={() => handleRun(t.id)}
                onDelete={() => handleDelete(t.id)}
                onPin={(p) => handlePin(t.id, p)}
                onRestore={() => handleRestore(t.id)}
                onPurge={() => handlePurge(t.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  view,
  selected,
  onToggleSelect,
  onOpen,
  onRun,
  onDelete,
  onPin,
  onRestore,
  onPurge,
}: {
  task: TaskListItem
  view: 'active' | 'trash'
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onRun: () => void
  onDelete: () => void
  onPin: (pinned: boolean) => void
  onRestore: () => void
  onPurge: () => void
}) {
  const isRunning = task.status === 'running'
  const progress = task.progress

  return (
    <Card className={cn(
      'group hover:border-emerald-500/40 hover:shadow-md transition-all overflow-hidden',
      selected && 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/30',
      task.pinned && view === 'active' && 'border-amber-500/30 bg-amber-500/[0.03]',
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Selection checkbox */}
          <button
            onClick={onToggleSelect}
            className="mt-1 shrink-0"
            title={selected ? 'Deselect' : 'Select'}
          >
            {selected ? <CheckSquare className="h-4 w-4 text-emerald-500" /> : <Square className="h-4 w-4 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />}
          </button>

          {/* Pin indicator */}
          {task.pinned && view === 'active' && (
            <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-1 fill-amber-500" />
          )}

          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10">
            {isRunning ? (
              <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
            ) : task.status === 'completed' ? (
              <Database className="h-5 w-5 text-emerald-500" />
            ) : task.status === 'failed' ? (
              <Inbox className="h-5 w-5 text-red-500" />
            ) : (
              <Sparkles className="h-5 w-5 text-slate-400" />
            )}
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card ${statusDotClass(task.status)}`} />
          </div>

          <button onClick={onOpen} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {task.title}
              </h3>
              <StatusBadge status={task.status} />
              {task.pinned && view === 'active' && (
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 gap-0.5">
                  <Pin className="h-2 w-2 fill-amber-500" /> PINNED
                </Badge>
              )}
              {view === 'active' && task.status === 'completed' && (
                <QualityBadge score={task.qualityScore} className="text-[9px] py-0 px-1.5" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{task.objective || task.prompt}</p>

            {isRunning && progress && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 max-w-xs overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all animate-pulse"
                    style={{
                      width: `${progress.total ? Math.min(100, (progress.current / progress.total) * 100) : 30}%`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">{progress.message || 'Working…'}</span>
              </div>
            )}

            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Database className="h-3 w-3" /> {fmtNum(task.stats?.items ?? task.itemCount)} records</span>
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {fmtNum(task.stats?.sources ?? task.sourceCount)} sources</span>
              {task.tags.slice(0, 3).map((tg) => (
                <Badge key={tg} variant="outline" className="text-[10px] py-0 px-1.5 bg-muted/40">{tg}</Badge>
              ))}
              <span className="ml-auto">{timeAgo(task.createdAt)}</span>
            </div>
            {task.error && !isRunning && (
              <p className="text-[11px] text-red-500 mt-1 line-clamp-1">⚠ {truncate(task.error, 100)}</p>
            )}
          </button>

          {/* Actions */}
          <div className="flex flex-col gap-1.5 shrink-0">
            {view === 'active' ? (
              <>
                <Button size="sm" variant="outline" onClick={onOpen} className="h-7 text-xs">
                  Open
                </Button>
                <div className="flex gap-0.5">
                  <Button size="sm" variant="ghost" onClick={() => onPin(!task.pinned)} className={cn('h-7 w-7 p-0', task.pinned ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500')} title={task.pinned ? 'Unpin' : 'Pin to top'}>
                    <Pin className={cn('h-3 w-3', task.pinned && 'fill-amber-500')} />
                  </Button>
                  {task.status !== 'running' && (
                    <Button size="sm" variant="ghost" onClick={onRun} className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700" title="Run / Re-run">
                      <Rocket className="h-3 w-3" />
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" title="Move to trash">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Move to trash?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This moves the task to trash. You can restore it from the Trash view. Records and sources are preserved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white">Move to trash</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={onRestore} className="h-7 text-xs text-emerald-600 dark:text-emerald-400">
                  <RotateCcw className="h-3 w-3 mr-1" /> Restore
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-3 w-3 mr-1" /> Delete forever
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the task and all its records and sources. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onPurge} className="bg-red-600 hover:bg-red-700 text-white">Delete forever</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
