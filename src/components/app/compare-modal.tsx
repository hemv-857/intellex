'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GitCompare,
  Database,
  Globe,
  ShieldCheck,
  RefreshCw,
  Zap,
  TrendingUp,
  Trophy,
  ArrowRight,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, fmtNum, timeAgo, type TaskListItem } from './shared'

interface CompareMetrics {
  items: number
  valid: number
  invalid: number
  sources: number
  uniqueHosts: number
  duplicates: number
  tokens: number
  validityRate: number
  dupRate: number
  sourceCoverage: number
  qualityScore: number
}

interface CompareTask {
  id: string
  title: string
  status: string
  objective: string | null
  tags: string[]
  fields: string[]
  createdAt: string
  updatedAt: string
  metrics: CompareMetrics
}

interface CompareResponse {
  a: CompareTask
  b: CompareTask
  sharedFields: string[]
  sharedTags: string[]
  winners: Record<string, 'a' | 'b' | 'tie'>
}

interface CompareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: TaskListItem[]
  initialA?: string | null
  initialB?: string | null
}

export function CompareModal({ open, onOpenChange, tasks, initialA, initialB }: CompareModalProps) {
  const [aId, setAId] = useState(initialA || '')
  const [bId, setBId] = useState(initialB || '')
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialA) setAId(initialA)
    if (initialB) setBId(initialB)
  }, [initialA, initialB])

  useEffect(() => {
    if (!open) return
    if (!aId || !bId || aId === bId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      return
    }
    setLoading(true)
    api<CompareResponse>(`/api/tasks/compare?a=${aId}&b=${bId}`)
      .then(setData)
      .catch((e) => toast.error((e as Error).message || 'Failed to compare'))
      .finally(() => setLoading(false))
  }, [open, aId, bId])

  const completedTasks = tasks.filter((t) => t.status === 'completed')

  // Export the comparison as a printable HTML report (opens print dialog → Save as PDF)
  const exportReport = () => {
    if (!data) return
    const { a, b, winners } = data
    const aWins = Object.values(winners).filter((w) => w === 'a').length
    const bWins = Object.values(winners).filter((w) => w === 'b').length
    const winnerLabel = aWins > bWins ? 'Task A' : bWins > aWins ? 'Task B' : 'Tie'
    const winnerTask = aWins > bWins ? a : b
    const rows: { label: string; a: string; b: string; winner: string }[] = [
      { label: 'Records', a: String(a.metrics.items), b: String(b.metrics.items), winner: winners.items },
      { label: 'Valid records', a: String(a.metrics.valid), b: String(b.metrics.valid), winner: winners.valid },
      { label: 'Validity rate', a: `${a.metrics.validityRate}%`, b: `${b.metrics.validityRate}%`, winner: winners.validityRate },
      { label: 'Sources', a: String(a.metrics.sources), b: String(b.metrics.sources), winner: winners.sources },
      { label: 'Unique domains', a: String(a.metrics.uniqueHosts), b: String(b.metrics.uniqueHosts), winner: 'tie' },
      { label: 'Duplicates', a: String(a.metrics.duplicates), b: String(b.metrics.duplicates), winner: 'tie' },
      { label: 'Dup rate', a: `${a.metrics.dupRate}%`, b: `${b.metrics.dupRate}%`, winner: 'tie' },
      { label: 'Tokens used', a: fmtNum(a.metrics.tokens), b: fmtNum(b.metrics.tokens), winner: winners.tokens },
      { label: 'Quality score', a: `${a.metrics.qualityScore}/100`, b: `${b.metrics.qualityScore}/100`, winner: winners.qualityScore },
    ]
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Intellex — Task Comparison Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; color: #1a2e2a; background: #fff; }
  .header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #10b981, #14b8a6); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 18px; }
  .header h1 { font-size: 20px; margin: 0; font-weight: 700; }
  .header .sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .meta { font-size: 11px; color: #94a3b8; text-align: right; margin-bottom: 20px; }
  .tasks { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .task-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .task-card.a { border-left: 4px solid #10b981; }
  .task-card.b { border-left: 4px solid #0ea5e9; }
  .task-card .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
  .task-card.a .label { color: #10b981; }
  .task-card.b .label { color: #0ea5e9; }
  .task-card .title { font-size: 14px; font-weight: 600; margin-top: 2px; }
  .task-card .age { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  th.a { color: #10b981; text-align: center; }
  th.b { color: #0ea5e9; text-align: center; }
  td { padding: 9px 12px; border-top: 1px solid #e2e8f0; font-size: 13px; }
  td.a, td.b { text-align: center; font-variant-numeric: tabular-nums; }
  td.win { font-weight: 700; color: #10b981; background: #ecfdf5; }
  td.win-b { font-weight: 700; color: #0ea5e9; background: #f0f9ff; }
  .quality { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .q-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .q-label { font-size: 10px; color: #64748b; margin-bottom: 6px; }
  .q-value { font-size: 20px; font-weight: 700; }
  .q-bar { height: 8px; border-radius: 4px; background: #e2e8f0; margin-top: 8px; overflow: hidden; }
  .q-fill { height: 100%; border-radius: 4px; }
  .verdict { border: 1px solid #10b981; background: #ecfdf5; border-radius: 8px; padding: 14px 16px; }
  .verdict h3 { margin: 0 0 4px 0; font-size: 13px; color: #10b981; }
  .verdict p { margin: 0; font-size: 12px; color: #1a2e2a; line-height: 1.5; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style></head><body>
  <div class="header">
    <div class="logo">I</div>
    <div><h1>Task Comparison Report</h1><div class="sub">Intellex · AI-Powered Data Intelligence Platform</div></div>
  </div>
  <div class="meta">Generated ${new Date().toLocaleString()}</div>
  <div class="tasks">
    <div class="task-card a"><div class="label">Task A</div><div class="title">${a.title.replace(/</g, '&lt;')}</div><div class="age">${a.tags.join(' · ') || '—'} · ${timeAgo(a.createdAt)}</div></div>
    <div class="task-card b"><div class="label">Task B</div><div class="title">${b.title.replace(/</g, '&lt;')}</div><div class="age">${b.tags.join(' · ') || '—'} · ${timeAgo(b.createdAt)}</div></div>
  </div>
  <table>
    <thead><tr><th>Metric</th><th class="a">Task A</th><th class="b">Task B</th></tr></thead>
    <tbody>
      ${rows.map((r) => `<tr><td>${r.label}</td><td class="a ${r.winner === 'a' ? 'win' : ''}">${r.a}</td><td class="b ${r.winner === 'b' ? 'win-b' : ''}">${r.b}</td></tr>`).join('')}
    </tbody>
  </table>
  <div class="quality">
    <div class="q-card"><div class="q-label">Task A quality</div><div class="q-value">${a.metrics.qualityScore}<span style="font-size:12px;color:#94a3b8;font-weight:400">/100</span></div><div class="q-bar"><div class="q-fill" style="width:${a.metrics.qualityScore}%;background:${a.metrics.qualityScore >= 80 ? '#10b981' : a.metrics.qualityScore >= 60 ? '#f59e0b' : '#ef4444'}"></div></div></div>
    <div class="q-card"><div class="q-label">Task B quality</div><div class="q-value">${b.metrics.qualityScore}<span style="font-size:12px;color:#94a3b8;font-weight:400">/100</span></div><div class="q-bar"><div class="q-fill" style="width:${b.metrics.qualityScore}%;background:${b.metrics.qualityScore >= 80 ? '#10b981' : b.metrics.qualityScore >= 60 ? '#f59e0b' : '#ef4444'}"></div></div></div>
  </div>
  <div class="verdict">
    <h3>🏆 Verdict: ${winnerLabel}</h3>
    <p>${winnerLabel === 'Tie' ? 'Both tasks perform comparably — ' + aWins + ' metric(s) each favor A and B respectively.' : winnerLabel + ' (' + winnerTask.title.replace(/</g, '&lt;') + ') leads in ' + Math.max(aWins, bWins) + ' of ' + (aWins + bWins) + ' differentiated metrics, with a quality score of ' + winnerTask.metrics.qualityScore + '/100.'}</p>
  </div>
  <div class="footer">Intellex · Prompt → Plan → Collect → Clean → Export · Generated ${new Date().toISOString()}</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) {
      toast.error('Pop-up blocked — allow pop-ups to export the report.')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border space-y-1 flex-row items-center justify-between">
          <div className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <GitCompare className="h-4 w-4 text-emerald-500" /> Compare Tasks
            </DialogTitle>
            <DialogDescription>Side-by-side metrics for two collections</DialogDescription>
          </div>
          {data && (
            <Button size="sm" variant="outline" onClick={exportReport} className="shrink-0">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export PDF
            </Button>
          )}
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[78vh] scrollbar-thin">
          {/* Task pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Task A</label>
              <Select value={aId} onValueChange={setAId}>
                <SelectTrigger className="bg-card"><SelectValue placeholder="Pick first task…" /></SelectTrigger>
                <SelectContent>
                  {completedTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="max-w-[20rem]">{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:flex items-center justify-center pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 block">Task B</label>
              <Select value={bId} onValueChange={setBId}>
                <SelectTrigger className="bg-card"><SelectValue placeholder="Pick second task…" /></SelectTrigger>
                <SelectContent>
                  {completedTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="max-w-[20rem]">{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Comparison body */}
          {!aId || !bId ? (
            <div className="py-12 text-center">
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-500/10 mb-3">
                <GitCompare className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-medium">Pick two tasks to compare</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                See which collection gathered more records, has higher validity, broader source coverage, and better data quality.
              </p>
            </div>
          ) : aId === bId ? (
            <div className="py-10 text-center text-sm text-amber-600">Pick two different tasks to compare.</div>
          ) : loading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !data ? null : (
            <>
              {/* Title row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="text-sm font-semibold truncate">{data.a.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(data.a.createdAt)}</div>
                </div>
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                  <div className="text-sm font-semibold truncate">{data.b.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(data.b.createdAt)}</div>
                </div>
              </div>

              {/* Metrics table */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Metric</span>
                  <span className="text-emerald-600 dark:text-emerald-400 text-center w-24">Task A</span>
                  <span className="text-sky-600 dark:text-sky-400 text-center w-24">Task B</span>
                </div>
                <MetricRow icon={Database} label="Records" a={data.a.metrics.items} b={data.b.metrics.items} fmt={fmtNum} winner={data.winners.items} />
                <MetricRow icon={ShieldCheck} label="Valid records" a={data.a.metrics.valid} b={data.b.metrics.valid} fmt={fmtNum} winner={data.winners.valid} />
                <MetricRow icon={ShieldCheck} label="Validity rate" a={data.a.metrics.validityRate} b={data.b.metrics.validityRate} fmt={(n) => `${n}%`} winner={data.winners.validityRate} />
                <MetricRow icon={Globe} label="Sources" a={data.a.metrics.sources} b={data.b.metrics.sources} fmt={fmtNum} winner={data.winners.sources} />
                <MetricRow icon={Globe} label="Unique domains" a={data.a.metrics.uniqueHosts} b={data.b.metrics.uniqueHosts} fmt={fmtNum} winner="tie" />
                <MetricRow icon={RefreshCw} label="Duplicates" a={data.a.metrics.duplicates} b={data.b.metrics.duplicates} fmt={fmtNum} winner="tie" />
                <MetricRow icon={RefreshCw} label="Dup rate" a={data.a.metrics.dupRate} b={data.b.metrics.dupRate} fmt={(n) => `${n}%`} winner="tie" />
                <MetricRow icon={Zap} label="Tokens used" a={data.a.metrics.tokens} b={data.b.metrics.tokens} fmt={fmtNum} winner={data.winners.tokens} hintLowerBetter />
                <MetricRow icon={TrendingUp} label="Quality score" a={data.a.metrics.qualityScore} b={data.b.metrics.qualityScore} fmt={(n) => `${n}/100`} winner={data.winners.qualityScore} />
              </div>

              {/* Quality bars */}
              <div className="grid grid-cols-2 gap-3">
                <QualityBar label="A quality" score={data.a.metrics.qualityScore} tint="emerald" />
                <QualityBar label="B quality" score={data.b.metrics.qualityScore} tint="sky" />
              </div>

              {/* Overlap */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h4 className="text-xs font-semibold flex items-center gap-1.5"><ArrowRight className="h-3 w-3 text-emerald-500" /> Overlap</h4>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground w-24">Shared fields</span>
                  <div className="flex flex-wrap gap-1">
                    {data.sharedFields.length > 0 ? data.sharedFields.map((f) => (
                      <Badge key={f} variant="outline" className="text-[9px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-mono">{f}</Badge>
                    )) : <span className="text-muted-foreground/60">none</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground w-24">Shared tags</span>
                  <div className="flex flex-wrap gap-1">
                    {data.sharedTags.length > 0 ? data.sharedTags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[9px] py-0 px-1.5 bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">{t}</Badge>
                    )) : <span className="text-muted-foreground/60">none</span>}
                  </div>
                </div>
              </div>

              {/* Summary verdict */}
              <div className="rounded-xl border border-border bg-gradient-to-br from-emerald-500/5 to-transparent p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <h4 className="text-sm font-semibold">Verdict</h4>
                </div>
                <VerdictText data={data} />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetricRow({
  icon: Icon,
  label,
  a,
  b,
  fmt,
  winner,
  hintLowerBetter,
}: {
  icon: any
  label: string
  a: number
  b: number
  fmt: (n: number) => string
  winner: 'a' | 'b' | 'tie'
  hintLowerBetter?: boolean
}) {
  // For lower-is-better metrics, flip the winner logic for display
  const effectiveWinner = hintLowerBetter
    ? a < b ? 'a' : a > b ? 'b' : 'tie'
    : winner
  const aTint = effectiveWinner === 'a' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : effectiveWinner === 'b' ? 'text-muted-foreground' : 'text-foreground'
  const bTint = effectiveWinner === 'b' ? 'text-sky-600 dark:text-sky-400 font-semibold' : effectiveWinner === 'a' ? 'text-muted-foreground' : 'text-foreground'
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 border-t border-border/60 items-center">
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className={cn('text-xs tabular-nums text-center w-24', aTint)}>
        {effectiveWinner === 'a' && <Trophy className="inline h-2.5 w-2.5 mr-0.5 text-amber-500" />}
        {fmt(a)}
      </span>
      <span className={cn('text-xs tabular-nums text-center w-24', bTint)}>
        {effectiveWinner === 'b' && <Trophy className="inline h-2.5 w-2.5 mr-0.5 text-amber-500" />}
        {fmt(b)}
      </span>
    </div>
  )
}

function QualityBar({ label, score, tint }: { label: string; score: number; tint: 'emerald' | 'sky' }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'
  const labelText = score >= 80 ? 'High' : score >= 60 ? 'Medium' : 'Low'
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-bold tabular-nums">{score}<span className="text-muted-foreground font-normal">/100</span></span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      <div className="text-[9px] text-muted-foreground mt-1">{labelText} quality</div>
    </div>
  )
}

function VerdictText({ data }: { data: CompareResponse }) {
  const { a, b, winners } = data
  const aWins = Object.values(winners).filter((w) => w === 'a').length
  const bWins = Object.values(winners).filter((w) => w === 'b').length
  if (aWins === bWins) {
    return <p className="text-xs text-muted-foreground leading-relaxed">Both tasks perform comparably across the measured metrics — {aWins} metric(s) each favor A and B respectively. Consider your specific priorities (volume vs quality vs efficiency) to decide.</p>
  }
  const winner = aWins > bWins ? a : b
  const winnerLabel = aWins > bWins ? 'Task A' : 'Task B'
  const wins = Math.max(aWins, bWins)
  return (
    <p className="text-xs text-foreground/80 leading-relaxed">
      <span className={cn('font-semibold', aWins > bWins ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400')}>{winnerLabel}</span>{' '}
      ({winner.title}) leads in <span className="font-semibold text-foreground">{wins} of {aWins + bWins}</span> differentiated metrics,
      with a quality score of <span className="font-semibold tabular-nums">{winner.metrics.qualityScore}/100</span>.
    </p>
  )
}
