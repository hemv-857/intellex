'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Area, AreaChart } from 'recharts'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  ShieldCheck,
  Gauge,
  Database,
  Globe,
  TrendingUp,
  Tag,
} from 'lucide-react'
import { api } from './shared'

interface Insights {
  totalRecords: number
  validRecords: number
  invalidRecords: number
  validityRate: number
  avgConfidence: number
  confidenceBuckets: { high: number; medium: number; low: number }
  fieldCompleteness: { field: string; filled: number; total: number; rate: number }[]
  sourceReliability: { hostName: string; fetched: number; failed: number; rate: number }[]
  topTags: { tag: string; count: number }[]
  qualityTrend: { date: string; avgScore: number; tasks: number }[]
}

const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899']

export function InsightsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    api<Insights>('/api/insights')
      .then(setData)
      .catch((e) => toast.error((e as Error).message || 'Failed to load insights'))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Data Quality Insights
          </DialogTitle>
          <DialogDescription>Platform-wide health of your collected datasets</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] scrollbar-thin">
          <div className="p-5 space-y-5">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !data ? null : (
              <>
                {/* Top metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Metric icon={Database} label="Total records" value={String(data.totalRecords)} tint="text-emerald-600 bg-emerald-500/10" />
                  <Metric icon={ShieldCheck} label="Validity rate" value={`${data.validityRate.toFixed(0)}%`} tint="text-teal-600 bg-teal-500/10" />
                  <Metric icon={Gauge} label="Avg confidence" value={`${data.avgConfidence.toFixed(0)}%`} tint="text-sky-600 bg-sky-500/10" />
                  <Metric icon={Tag} label="Unique tags" value={String(data.topTags.length)} tint="text-violet-600 bg-violet-500/10" />
                </div>

                {/* Confidence distribution */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-emerald-500" /> Confidence distribution
                  </h3>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'High (≥75%)', count: data.confidenceBuckets.high, fill: '#10b981' },
                        { name: 'Medium (50-74%)', count: data.confidenceBuckets.medium, fill: '#f59e0b' },
                        { name: 'Low (<50%)', count: data.confidenceBuckets.low, fill: '#ef4444' },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.5)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'oklch(0.5 0 0)' }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'oklch(0.5 0 0)' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid oklch(0.9 0 0)', fontSize: 12 }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={60}>
                          {[0, 1, 2].map((i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Quality-score trend (sparkline) */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Quality-score trend
                  </h3>
                  <p className="text-[10px] text-muted-foreground mb-3">Average data-quality score per day (last 14 days)</p>
                  <div className="h-32">
                    {data.qualityTrend && data.qualityTrend.some((d) => d.avgScore > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.qualityTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gQuality" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.5)" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(d) => d.slice(5)}
                            tick={{ fontSize: 10, fill: 'oklch(0.5 0 0)' }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'oklch(0.5 0 0)' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: 10, border: '1px solid oklch(0.9 0 0)', fontSize: 12 }}
                            formatter={(v: any, n: any) => [n === 'avgScore' ? `${v}/100` : v, n === 'avgScore' ? 'Quality' : 'Tasks']}
                          />
                          <Area type="monotone" dataKey="avgScore" name="avgScore" stroke="#10b981" strokeWidth={2} fill="url(#gQuality)" dot={{ r: 2, fill: '#10b981' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                        No completed tasks in the last 14 days
                      </div>
                    )}
                  </div>
                </div>

                {/* Field completeness */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-500" /> Field completeness
                  </h3>
                  {data.fieldCompleteness.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No data yet</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                      {data.fieldCompleteness.slice(0, 12).map((f) => (
                        <div key={f.field}>
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <code className="font-mono text-foreground/80">{f.field}</code>
                            <span className="text-muted-foreground tabular-nums">{f.filled}/{f.total} · {f.rate.toFixed(0)}%</span>
                          </div>
                          <Progress value={f.rate} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Source reliability */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-sky-500" /> Source reliability
                  </h3>
                  {data.sourceReliability.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No sources yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.sourceReliability.slice(0, 8).map((s) => (
                        <div key={s.hostName} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1 truncate text-muted-foreground">{s.hostName}</span>
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${s.rate}%`, backgroundColor: s.rate >= 80 ? '#10b981' : s.rate >= 50 ? '#f59e0b' : '#ef4444' }}
                            />
                          </div>
                          <span className="tabular-nums text-muted-foreground w-10 text-right">{s.rate.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top tags */}
                {data.topTags.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Tag className="h-4 w-4 text-violet-500" /> Top tags
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {data.topTags.map(({ tag, count }) => (
                        <Badge key={tag} variant="outline" className="bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
                          {tag} <span className="ml-1 text-muted-foreground">{count}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function Metric({ icon: Icon, label, value, tint }: { icon: any; label: string; value: string; tint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tint} mb-2`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
