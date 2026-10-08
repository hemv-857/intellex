'use client'

import { useEffect, useState } from 'react'
import { Gauge, Zap, TriangleAlert } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

// Provider usage panel.
//
// Both providers are on free-tier allowances, so the question that matters is
// how close the workspace is to being cut off, not the raw token count. Credits
// are the unit that actually depletes.

interface UsageData {
  total: { credits: number; tokens: number; items: number; sources: number }
  runs: Array<{
    taskId: string
    title: string
    status: string
    credits: number
    tokens: number
    items: number
    at: string | null
  }>
  estimates: {
    tavilyFreeCredits: number
    creditsPctOfFreeTier: number
    avgCreditsPerRun: number
    runsRemainingOnFreeTier: number
  }
}

export function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/usage', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setData(d)
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  if (!data) return null

  const { total, estimates } = data
  const pct = Math.min(100, Math.max(0, estimates.creditsPctOfFreeTier))
  // Only warn once the allowance is genuinely in play; a single test run is not
  // news.
  const warn = pct >= 80
  const critical = pct >= 95

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium">Provider usage</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border px-2.5 py-2">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3" /> Tavily credits
          </div>
          <div className="text-lg font-semibold tabular-nums leading-tight">{total.credits}</div>
          <div className="text-[10px] text-muted-foreground">
            of ~{estimates.tavilyFreeCredits} free
          </div>
        </div>
        <div className="rounded-lg border border-border px-2.5 py-2">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Zap className="h-3 w-3" /> Chat tokens
          </div>
          <div className="text-lg font-semibold tabular-nums leading-tight">
            {total.tokens.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground">{total.items} records total</div>
        </div>
      </div>

      <div className="space-y-1">
        <Progress
          value={pct}
          className={critical ? '[&>div]:bg-red-500' : warn ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500'}
        />
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {warn && <TriangleAlert className={critical ? 'h-3 w-3 text-red-500' : 'h-3 w-3 text-amber-500'} />}
          {estimates.avgCreditsPerRun > 0
            ? `About ${estimates.avgCreditsPerRun} credits per run — roughly ${estimates.runsRemainingOnFreeTier} more run(s) at that rate.`
            : 'No completed runs yet, so no per-run cost to project.'}
        </p>
      </div>
    </section>
  )
}