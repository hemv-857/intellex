'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  History,
  Database,
  Globe,
  Rocket,
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  Loader2,
  Sparkles,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { api, type TaskListItem, StatusBadge, statusDotClass, fmtNum, fmtDate, timeAgo, truncate } from './shared'

interface HistoryProps {
  onOpenTask: (id: string) => void
  onNew: () => void
}

export function History({ onOpenTask, onNew }: HistoryProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ tasks: TaskListItem[] }>('/api/tasks')
      .then((d) => setTasks(d.tasks))
      .catch((e) => toast.error((e as Error).message || 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [])

  // group by day
  const groups = new Map<string, TaskListItem[]>()
  for (const t of tasks) {
    const key = new Date(t.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }
  const days = [...groups.entries()]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-5 w-5 text-violet-500" /> Workflow History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Timeline of every collection, from creation to completion.
          </p>
        </div>
        <Button size="sm" onClick={onNew} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Sparkles className="h-4 w-4 mr-1.5" /> New Collection
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10 mb-3">
              <History className="h-6 w-6 text-violet-500" />
            </div>
            <p className="text-sm font-medium">No history yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">Your collection history will appear here as you create tasks.</p>
            <Button size="sm" onClick={onNew} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Sparkles className="h-4 w-4 mr-1.5" /> New Collection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[44rem] scrollbar-thin pr-2">
          <div className="relative pl-6">
            {/* vertical line */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-emerald-500/40 via-border to-transparent" />
            <div className="space-y-6">
              {days.map(([day, items]) => (
                <div key={day} className="relative">
                  <div className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-2 ring-emerald-500/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground">{day}</span>
                    <span className="text-[11px] text-muted-foreground/60">· {items.length} task{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onOpenTask(t.id)}
                        className="group w-full text-left rounded-lg border border-border bg-card hover:border-emerald-500/40 hover:shadow-sm transition-all p-3"
                      >
                        <div className="flex items-start gap-3">
                          <StatusIcon status={t.status} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                {t.title}
                              </span>
                              <StatusBadge status={t.status} />
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{t.objective || t.prompt}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5"><Database className="h-2.5 w-2.5" />{fmtNum(t.stats?.items ?? t.itemCount)}</span>
                              <span className="flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" />{fmtNum(t.stats?.sources ?? t.sourceCount)}</span>
                              <span>{fmtDate(t.createdAt)}</span>
                              <span className="text-muted-foreground/60">· {timeAgo(t.createdAt)}</span>
                            </div>
                            {t.error && !['running', 'planned'].includes(t.status) && (
                              <p className="text-[10px] text-red-500 mt-1 line-clamp-1">⚠ {truncate(t.error, 80)}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: TaskListItem['status'] }) {
  const cls = cn('h-4 w-4 shrink-0 mt-0.5', statusDotClass(status).replace('bg-', 'text-'))
  if (status === 'running') return <Loader2 className={cn(cls, 'animate-spin')} />
  if (status === 'completed') return <CheckCircle2 className={cls} />
  if (status === 'failed') return <AlertCircle className={cls} />
  if (status === 'planned') return <CircleDashed className={cls} />
  return <Rocket className={cls} />
}
