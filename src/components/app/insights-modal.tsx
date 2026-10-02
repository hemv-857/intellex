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
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  ShieldCheck,
  Gauge,
  Database,
  Globe,
  TrendingUp,
  Download,
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

// Same print-to-PDF approach as the Compare modal: a self-contained HTML
// document written into a new window and handed to window.print(). No dependency,
// vector output, and the user picks paper size and orientation.
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function bar(rate: number, tone: string): string {
  const pct = Math.max(0, Math.min(100, rate))
  return `<div class="bar"><div class="fill ${tone}" style="width:${pct}%"></div></div>`
}

function exportReport(d: Insights) {
  const rows = (list: string[]) => list.join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Intellex — Data Quality Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; margin: 0; padding: 32px; background: #fff; }
  .header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #10b981; padding-bottom: 14px; }
  .logo { width: 38px; height: 38px; border-radius: 10px; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }
  h1 { font-size: 19px; margin: 0; } .sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .meta { font-size: 10px; color: #94a3b8; margin: 10px 0 20px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
  .card .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
  .card .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  h2 { font-size: 13px; margin: 20px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #f1f5f9; }
  th { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 9.5px; letter-spacing: .04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .bar { height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; min-width: 70px; }
  .fill { height: 100%; } .good { background: #10b981; } .mid { background: #f59e0b; } .bad { background: #ef4444; } .info { background: #0ea5e9; }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag { font-size: 10px; background: #f1f5f9; border-radius: 4px; padding: 2px 7px; color: #475569; }
  .footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 16px; } }
</style></head><body>
  <div class="header"><div class="logo">I</div><div><h1>Data Quality Report</h1><div class="sub">Intellex · AI-Powered Data Intelligence Platform</div></div></div>
  <div class="meta">Generated ${esc(new Date().toLocaleString())}</div>

  <div class="cards">
    <div class="card"><div class="label">Total records</div><div class="value">${esc(d.totalRecords)}</div></div>
    <div class="card"><div class="label">Valid records</div><div class="value">${esc(d.validRecords)}</div></div>
    <div class="card"><div class="label">Validity rate</div><div class="value">${esc(d.validityRate)}%</div></div>
    <div class="card"><div class="label">Avg confidence</div><div class="value">${esc(d.avgConfidence)}%</div></div>
  </div>

  <h2>Confidence distribution</h2>
  <table><thead><tr><th>Bucket</th><th class="num">Records</th><th class="num">Share</th><th>Distribution</th></tr></thead><tbody>
    ${rows([
      { label: 'High (≥75%)', n: d.confidenceBuckets.high, tone: 'good' },
      { label: 'Medium (50–74%)', n: d.confidenceBuckets.medium, tone: 'mid' },
      { label: 'Low (<50%)', n: d.confidenceBuckets.low, tone: 'bad' },
    ].map((b) => {
      const share = d.totalRecords > 0 ? (b.n / d.totalRecords) * 100 : 0
      return `<tr><td>${esc(b.label)}</td><td class="num">${esc(b.n)}</td><td class="num">${share.toFixed(1)}%</td><td>${bar(share, b.tone)}</td></tr>`
    }))}
  </tbody></table>

  <h2>Field completeness</h2>
  <table><thead><tr><th>Field</th><th class="num">Filled</th><th class="num">Total</th><th class="num">Rate</th><th>Coverage</th></tr></thead><tbody>
    ${rows(d.fieldCompleteness.slice(0, 40).map((f) =>
      `<tr><td>${esc(f.field)}</td><td class="num">${esc(f.filled)}</td><td class="num">${esc(f.total)}</td><td class="num">${esc(f.rate)}%</td><td>${bar(f.rate, f.rate >= 80 ? 'good' : f.rate >= 50 ? 'mid' : 'bad')}</td></tr>`))}
  </tbody></table>

  <h2>Source reliability</h2>
  <table><thead><tr><th>Host</th><th class="num">Read</th><th class="num">Failed</th><th class="num">Rate</th><th>Reliability</th></tr></thead><tbody>
    ${rows(d.sourceReliability.map((h) =>
      `<tr><td>${esc(h.hostName)}</td><td class="num">${esc(h.fetched)}</td><td class="num">${esc(h.failed)}</td><td class="num">${esc(h.rate)}%</td><td>${bar(h.rate, h.rate >= 80 ? 'good' : h.rate >= 50 ? 'mid' : 'bad')}</td></tr>`))}
  </tbody></table>

  <h2>Quality score trend (last 14 days)</h2>
  <table><thead><tr><th>Date</th><th class="num">Avg score</th><th class="num">Tasks</th><th>Score</th></tr></thead><tbody>
    ${rows(d.qualityTrend.filter((t) => t.tasks > 0).map((t) =>
      `<tr><td>${esc(t.date)}</td><td class="num">${esc(t.avgScore)}</td><td class="num">${esc(t.tasks)}</td><td>${bar(t.avgScore, t.avgScore >= 80 ? 'good' : t.avgScore >= 60 ? 'mid' : 'bad')}</td></tr>`))}
  </tbody></table>

  <h2>Top tags</h2>
  <div class="tags">${rows(d.topTags.map((t) => `<span class="tag">${esc(t.tag)} · ${esc(t.count)}</span>`))}</div>

  <div class="footer">Intellex · Prompt → Plan → Collect → Clean → Export · Generated ${esc(new Date().toISOString())}</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) {
    toast.error('Pop-up blocked — allow pop-ups to export the report.')
    return
  }
  w.document.write(html)
  w.document.close()
}

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data || loading}
              onClick={() => data && exportReport(data)}
              title="Export as PDF"
            >
              <Download className="h-3.5 w-3.5" /> Export PDF
            </Button>
          </div>
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
