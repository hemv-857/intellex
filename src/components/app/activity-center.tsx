'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Rocket,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Sparkles,
  Clock,
  Pin,
  RotateCcw,
  CalendarClock,
  Download,
  FileText,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, timeAgo } from './shared'
import { type Section } from './sidebar'
import type { LucideIcon } from 'lucide-react'

interface ActivityItem {
  id: string
  taskId: string | null
  taskTitle: string | null
  type: string
  message: string
  meta: string | null
  createdAt: string
}

interface ActivityCenterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenTask: (id: string) => void
}

const TYPE_META: Record<string, { icon: LucideIcon; tint: string }> = {
  task_created: { icon: Sparkles, tint: 'text-sky-500 bg-sky-500/10' },
  task_run: { icon: Rocket, tint: 'text-amber-500 bg-amber-500/10' },
  task_completed: { icon: CheckCircle2, tint: 'text-emerald-500 bg-emerald-500/10' },
  task_failed: { icon: AlertCircle, tint: 'text-red-500 bg-red-500/10' },
  task_deleted: { icon: Trash2, tint: 'text-red-500 bg-red-500/10' },
  task_pinned: { icon: Pin, tint: 'text-violet-500 bg-violet-500/10' },
  task_restored: { icon: RotateCcw, tint: 'text-teal-500 bg-teal-500/10' },
  task_scheduled: { icon: CalendarClock, tint: 'text-indigo-500 bg-indigo-500/10' },
  template_saved: { icon: FileText, tint: 'text-violet-500 bg-violet-500/10' },
  export: { icon: Download, tint: 'text-emerald-500 bg-emerald-500/10' },
}

export function ActivityCenter({ open, onOpenChange, onOpenTask }: ActivityCenterProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    api<{ activities: ActivityItem[] }>('/api/activity?limit=60')
      .then((d) => setActivities(d.activities))
      .catch((e) => toast.error((e as Error).message || 'Failed to load activity'))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-emerald-500" /> Activity &amp; Notifications
          </SheetTitle>
          <SheetDescription>Recent actions across your workspace</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-4rem)] scrollbar-thin">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Actions like creating tasks, running collections, and exports will appear here.
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {activities.map((a) => {
                const meta = TYPE_META[a.type] || { icon: Clock, tint: 'text-muted-foreground bg-muted' }
                const Icon = meta.icon
                return (
                  <button
                    key={a.id}
                    disabled={!a.taskId}
                    onClick={() => a.taskId && onOpenTask(a.taskId)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      a.taskId ? 'hover:bg-accent cursor-pointer' : 'cursor-default',
                    )}
                  >
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', meta.tint)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug break-words">{a.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {a.taskTitle && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate">{a.taskTitle}</span>}
                        <span className="text-[10px] text-muted-foreground">· {timeAgo(a.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
