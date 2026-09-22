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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { api, type TaskListItem, type TaskStatus, StatusBadge, statusDotClass, fmtNum, timeAgo, truncate } from './shared'

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
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const data = await api<{ tasks: TaskListItem[] }>(`/api/tasks?status=${status}&q=${encodeURIComponent(q)}`)
      setTasks(data.tasks)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [q, status])

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
    const interval = setInterval(() => {
      load()
    }, 2500)
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
      toast.success('Task deleted.')
      load()
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete')
    }
  }

  const runningCount = tasks.filter((t) => t.status === 'running').length

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-emerald-500" /> Collection Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}{runningCount > 0 && ` · ${runningCount} running`}
          </p>
        </div>
        <Button onClick={onNew} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Sparkles className="h-4 w-4 mr-1.5" /> New Collection
        </Button>
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
        <Button variant="outline" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

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
              <Inbox className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-sm font-medium">No tasks found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {q || status !== 'all' ? 'Try adjusting your filters.' : 'Start by creating a new data collection.'}
            </p>
            <Button onClick={onNew} size="sm" className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Sparkles className="h-4 w-4 mr-1.5" /> New Collection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onOpen={() => onOpenTask(t.id)}
              onRun={() => handleRun(t.id)}
              onDelete={() => handleDelete(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onOpen, onRun, onDelete }: { task: TaskListItem; onOpen: () => void; onRun: () => void; onDelete: () => void }) {
  const isRunning = task.status === 'running'
  const progress = task.progress

  return (
    <Card className="group hover:border-emerald-500/40 hover:shadow-md transition-all overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
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

          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={onOpen} className="h-7 text-xs">
              Open
            </Button>
            {task.status !== 'running' && (
              <Button size="sm" variant="ghost" onClick={onRun} className="h-7 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700">
                <Rocket className="h-3 w-3 mr-1" /> Run
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-red-500">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes the task, its collected records, and all traced sources. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
