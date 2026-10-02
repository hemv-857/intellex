'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Sparkles,
  ListChecks,
  Database,
  Globe,
  CheckCircle2,
  Loader2,
  Zap,
  TrendingUp,
  ArrowRight,
  Tag,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, type DashboardStats, fmtNum, fmtDate, timeAgo, StatusBadge, statusDotClass } from './shared'
import { type Section } from './sidebar'

interface DashboardProps {
  onOpenTask: (id: string) => void
  onNavigate: (s: Section) => void
}

const CHART_COLORS = ['#10b981', '#14b8a6', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#84cc16']

export function Dashboard({ onOpenTask, onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api<DashboardStats>('/api/stats')
      .then((d) => alive && setStats(d))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const counts = stats?.counts
  const cards = [
    {
      label: 'Total Tasks',
      value: counts?.totalTasks ?? 0,
      icon: ListChecks,
      tint: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
      ring: 'ring-emerald-500/20',
      sub: `${counts?.plannedTasks ?? 0} planned${counts?.pinnedTasks ? ` · ${counts.pinnedTasks} pinned` : ''}`,
    },
    {
      label: 'Active Runs',
      value: counts?.runningTasks ?? 0,
      icon: Loader2,
      tint: 'from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400',
      ring: 'ring-amber-500/20',
      sub: 'in progress now',
      spin: true,
    },
    {
      label: 'Data Records',
      value: counts?.totalItems ?? 0,
      icon: Database,
      tint: 'from-teal-500/15 to-teal-500/5 text-teal-600 dark:text-teal-400',
      ring: 'ring-teal-500/20',
      sub: `${counts?.validItems ?? 0} valid`,
    },
    {
      label: 'Sources Traced',
      value: counts?.totalSources ?? 0,
      icon: Globe,
      tint: 'from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400',
      ring: 'ring-sky-500/20',
      sub: 'across all tasks',
    },
    {
      // Only counts from collections whose token usage is real per-call API
      // usage. Older collections recorded an inflated upstream figure, so they
      // are excluded rather than averaged into something meaningless.
      label: 'AI Tokens',
      value: (counts?.tokensTrackedTasks ?? 0) > 0 ? (counts?.tokens ?? 0) : 0,
      icon: Zap,
      tint: 'from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400',
      ring: 'ring-violet-500/20',
      sub:
        (counts?.tokensTrackedTasks ?? 0) > 0
          ? `from ${counts?.tokensTrackedTasks} collection${counts?.tokensTrackedTasks === 1 ? '' : 's'}`
          : 'not tracked yet',
    },
    {
      label: 'Completed',
      value: counts?.completedTasks ?? 0,
      icon: CheckCircle2,
      tint: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
      ring: 'ring-emerald-500/20',
      sub: `successful runs`,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-6 md:p-8 shadow-sm">
        {/* premium mesh gradient backdrop */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(at 20% 20%, oklch(0.62 0.14 162 / 0.25) 0px, transparent 50%), radial-gradient(at 80% 0%, oklch(0.6 0.12 195 / 0.18) 0px, transparent 50%), radial-gradient(at 0% 100%, oklch(0.7 0.15 85 / 0.12) 0px, transparent 50%)',
          }}
        />
        {/* fine grid texture */}
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            color: 'oklch(0.3 0.05 165)',
          }}
        />
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2 max-w-2xl">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Data Intelligence
            </Badge>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-balance">
              Turn plain-English requests into structured, source-backed datasets.
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Describe what you need. The AI designs the collection workflow, gathers data from permitted web sources, cleans and deduplicates it, and presents a traceable dataset.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => onNavigate('new')} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20">
              <Sparkles className="h-4 w-4 mr-2" /> New Collection
            </Button>
            <Button variant="outline" onClick={() => onNavigate('tasks')}>
              View Tasks <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon
          return (
            <Card key={c.label} className={`relative overflow-hidden ring-1 ${c.ring} hover:shadow-md transition-shadow`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${c.tint}`}>
                    <Icon className={`h-4 w-4 ${c.spin ? 'animate-spin' : ''}`} />
                  </div>
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold tracking-tight">
                    {loading ? <Skeleton className="h-6 w-12" /> : fmtNum(c.value)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">{c.sub}</div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Collection Activity
            </CardTitle>
            <CardDescription>Tasks created in the last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.timeseries || []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.5)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => d.slice(5)}
                      tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid oklch(0.9 0 0)',
                        fontSize: 12,
                        background: 'oklch(1 0 0)',
                      }}
                    />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} fill="url(#gCompleted)" />
                    <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" strokeWidth={2} fill="url(#gFailed)" />
                    <Area type="monotone" dataKey="planned" name="Planned" stroke="#94a3b8" strokeWidth={1.5} fill="none" strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-sky-500" /> Top Source Domains
            </CardTitle>
            <CardDescription>Where data originates</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (stats?.topDomains?.length ?? 0) === 0 ? (
                <EmptyChart label="No sources collected yet" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.topDomains || []} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.5)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'oklch(0.5 0 0)' }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="host"
                      width={90}
                      tick={{ fontSize: 10, fill: 'oklch(0.5 0 0)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => (v.length > 14 ? v.slice(0, 13) + '…' : v)}
                    />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid oklch(0.9 0 0)', fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                      {(stats?.topDomains || []).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent tasks + tags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-emerald-500" /> Recent Collections
              </CardTitle>
              <CardDescription>Latest tasks across your workspace</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('tasks')} className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700">
              View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-96">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (stats?.recent?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="No collections yet"
                  description="Start by describing a data need in plain English."
                  action={<Button size="sm" onClick={() => onNavigate('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Sparkles className="h-3.5 w-3.5 mr-1" /> New Collection</Button>}
                />
              ) : (
                <div className="space-y-1">
                  {stats?.recent.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onOpenTask(t.id)}
                      className="group w-full text-left rounded-lg border border-transparent hover:border-border hover:bg-accent/40 transition-colors px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(t.status)}`} />
                            <p className="text-sm font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {t.title}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{t.objective || t.prompt}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Database className="h-3 w-3" /> {fmtNum(t.stats?.items ?? t.itemCount)}</span>
                            <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {fmtNum(t.stats?.sources ?? t.sourceCount)}</span>
                            <span>{timeAgo(t.createdAt)}</span>
                          </div>
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-violet-500" /> Tag Cloud
            </CardTitle>
            <CardDescription>Topics across collections</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (stats?.tagDist?.length ?? 0) === 0 ? (
              <EmptyChart label="No tags yet" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats?.tagDist.map(({ tag, count }) => {
                  const max = stats?.tagDist[0]?.count || 1
                  const size = 0.8 + (count / max) * 0.6
                  return (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="bg-accent/60 border-border text-foreground/80 hover:bg-accent transition-colors"
                      style={{ fontSize: `${size * 0.7}rem` }}
                    >
                      {tag}
                      <span className="ml-1 text-muted-foreground">{count}</span>
                    </Badge>
                  )
                })}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">Quick start prompts</div>
              <div className="space-y-1.5">
                {[
                  'Find 8 recent AI startup funding rounds',
                  'List top 10 remote-first design agencies',
                  'Collect 12 upcoming tech conferences in 2025',
                ].map((p) => (
                  <button
                    key={p}
                    onClick={() => onNavigate('new')}
                    className="block w-full text-left text-[11px] text-muted-foreground hover:text-foreground truncate rounded-md px-2 py-1.5 bg-muted/50 hover:bg-muted transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-full relative flex flex-col items-center justify-center text-center overflow-hidden">
      {/* subtle grid backdrop to suggest a chart area */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          color: 'oklch(0.5 0.05 165)',
        }}
      />
      {/* baseline axis */}
      <div className="absolute bottom-6 left-3 right-3 h-px bg-border/60" />
      <div className="relative flex flex-col items-center">
        <div className="flex items-end gap-1 mb-2 opacity-40">
          {[12, 20, 8, 16, 10].map((h, i) => (
            <div
              key={i}
              className="w-2 rounded-t-sm bg-gradient-to-t from-emerald-500/30 to-teal-400/20"
              style={{ height: h }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Run a collection to populate</p>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description, action }: { icon: any; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-3">
        <Icon className="h-6 w-6 text-emerald-500" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
