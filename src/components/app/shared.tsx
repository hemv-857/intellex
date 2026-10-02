import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CheckCircle2, Loader2, CircleDashed, AlertCircle, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types (mirror API responses)
// ---------------------------------------------------------------------------

export type TaskStatus = 'planned' | 'running' | 'completed' | 'failed'

export interface TaskListItem {
  id: string
  title: string
  prompt: string
  status: TaskStatus
  objective: string | null
  tags: string[]
  stats: { items?: number; sources?: number; valid?: number; duplicates?: number; tokens?: number }
  progress: { step?: string; message?: string; current?: number; total?: number } | null
  itemCount: number
  sourceCount: number
  pinned: boolean
  trashedAt: string | null
  qualityScore: number
  confidenceBuckets: { high: number; medium: number; low: number }
  createdAt: string
  updatedAt: string
  error: string | null
}

export interface FieldDef {
  name: string
  type: 'string' | 'number' | 'date' | 'url' | 'email' | 'boolean'
  description: string
  required?: boolean
}

export interface WorkflowStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  detail?: string
}

export interface DataSourceView {
  id: string
  url: string
  title: string | null
  snippet: string | null
  hostName: string | null
  favicon: string | null
  publishedTime: string | null
  rank: number
  fetchStatus: 'pending' | 'fetched' | 'failed'
  tokensUsed: number
  contentExcerpt: string | null
  fetchedAt: string | null
}

export interface DataItemView {
  id: string
  title: string | null
  summary: string | null
  confidence: number
  valid: boolean
  data: Record<string, unknown>
  sourceId: string | null
  createdAt: string
}

export interface TaskDetail {
  id: string
  title: string
  prompt: string
  status: TaskStatus
  objective: string | null
  fields: FieldDef[]
  searchQueries: string[]
  sourceStrategy: string[]
  validationRules: string[]
  tags: string[]
  workflow: WorkflowStep[]
  progress: { step?: string; message?: string; current?: number; total?: number }
  stats: { items?: number; sources?: number; valid?: number; duplicates?: number; tokens?: number }
  error: string | null
  trashedAt: string | null
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface DashboardStats {
  counts: {
    totalTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
    plannedTasks: number
    pinnedTasks?: number
    totalItems: number
    totalSources: number
    validItems: number
    tokens: number
  }
  recent: (TaskListItem & { stats: any })[]
  timeseries: { date: string; planned: number; completed: number; failed: number; running: number }[]
  topDomains: { host: string; count: number }[]
  tagDist: { tag: string; count: number }[]
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  TaskStatus,
  { label: string; className: string; icon: LucideIcon; dot: string }
> = {
  planned: {
    label: 'Planned',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    icon: CircleDashed,
    dot: 'bg-slate-400',
  },
  running: {
    label: 'Running',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    icon: Loader2,
    dot: 'bg-amber-500 animate-pulse',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-900',
    icon: AlertCircle,
    dot: 'bg-red-500',
  },
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', meta.className, className)}>
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {meta.label}
    </Badge>
  )
}

export function statusDotClass(status: TaskStatus) {
  return STATUS_META[status].dot
}

// ---------------------------------------------------------------------------
// Data-quality badge — a 0-100 score with color + tiny ring
// ---------------------------------------------------------------------------

import { Gauge } from 'lucide-react'

export function QualityBadge({ score, className }: { score: number; className?: string }) {
  if (!score || score <= 0) return null
  const tier = score >= 80 ? 'emerald' : score >= 60 ? 'amber' : 'red'
  const tint =
    tier === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
      : tier === 'amber'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
      : 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20'
  const ringColor = tier === 'emerald' ? 'bg-emerald-500' : tier === 'amber' ? 'bg-amber-500' : 'bg-red-500'
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium tabular-nums', tint, className)} title={`Data quality: ${score}/100`}>
      <Gauge className="h-2.5 w-2.5" />
      <span>{score}</span>
      <span className="h-1 w-6 overflow-hidden rounded-full bg-muted/60">
        <span className={cn('block h-full rounded-full', ringColor)} style={{ width: `${score}%` }} />
      </span>
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Mini confidence sparkline — a 3-segment stacked bar (high/medium/low)
// shown on task cards for an at-a-glance quality view.
// ---------------------------------------------------------------------------

export function MiniConfidenceBar({
  buckets,
  className,
  taskId,
}: {
  buckets: { high: number; medium: number; low: number }
  className?: string
  taskId?: string
}) {
  const { high, medium, low } = buckets
  const total = high + medium + low
  if (total === 0) return null
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  const highPct = pct(high)
  const medPct = pct(medium)
  const lowPct = pct(low)
  const clickable = !!taskId
  const onSegClick = (e: React.MouseEvent, bucket: 'high' | 'medium' | 'low', count: number) => {
    if (!clickable || count === 0) return
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('intellex:open-task-with-filter', { detail: { taskId, bucket } }))
  }
  const segCls = (count: number) =>
    clickable && count > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
  const segTitle = (count: number, bucket: string) =>
    clickable && count > 0 ? `Click to view ${count} ${bucket}-confidence records` : `${count} ${bucket}`
  return (
    <div className={cn('flex items-center gap-1.5', className)} title={`Confidence: ${high} high · ${medium} medium · ${low} low`}>
      <div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        {highPct > 0 && (
          <div
            className={cn('h-full bg-emerald-500', segCls(high))}
            style={{ width: `${highPct}%` }}
            onClick={clickable && high > 0 ? (e) => onSegClick(e, 'high', high) : undefined}
            title={segTitle(high, 'high')}
          />
        )}
        {medPct > 0 && (
          <div
            className={cn('h-full bg-amber-500', segCls(medium))}
            style={{ width: `${medPct}%` }}
            onClick={clickable && medium > 0 ? (e) => onSegClick(e, 'medium', medium) : undefined}
            title={segTitle(medium, 'medium')}
          />
        )}
        {lowPct > 0 && (
          <div
            className={cn('h-full bg-red-500', segCls(low))}
            style={{ width: `${lowPct}%` }}
            onClick={clickable && low > 0 ? (e) => onSegClick(e, 'low', low) : undefined}
            title={segTitle(low, 'low')}
          />
        )}
      </div>
      <span className="text-[9px] tabular-nums text-muted-foreground">{total}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data as T
}
