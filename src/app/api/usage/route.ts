import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Provider usage, per task and workspace-wide.
//
// Both providers run on free-tier allowances: Tavily charges credits, and a
// 5-query + 8-page collection costs 13 of them. That is a small monthly budget,
// so the useful question is not "how many tokens did I use" but "how close am I
// to being cut off". Token counts alone would not answer that.
//
// Credits are summed from each task's stats, which are written during the run.
// That deliberately excludes spend from a run that crashed before writing
// stats — an undercount is preferable to inventing a number, and the per-run
// ActivityLog entries still record what did happen.

export const dynamic = 'force-dynamic'

function safeObj(s?: string | null): Record<string, unknown> {
  if (!s) return {}
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')?.trim() || undefined

  const tasks = await db.task.findMany({
    where: taskId ? { id: taskId } : {},
    select: { id: true, title: true, status: true, stats: true, completedAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: taskId ? 1 : 200,
  })

  const rows = tasks.map((t) => {
    const stats = safeObj(t.stats)
    return {
      taskId: t.id,
      title: t.title,
      status: t.status,
      credits: num(stats.credits),
      tokens: num(stats.tokens),
      items: num(stats.items),
      sources: num(stats.sources),
      // Null when the run never completed, so the UI can say "not yet" rather
      // than implying a zero-cost successful run.
      at: (t.completedAt ?? t.updatedAt)?.toISOString() ?? null,
    }
  })

  const total = rows.reduce(
    (acc, r) => ({
      credits: acc.credits + r.credits,
      tokens: acc.tokens + r.tokens,
      items: acc.items + r.items,
      sources: acc.sources + r.sources,
    }),
    { credits: 0, tokens: 0, items: 0, sources: 0 },
  )

  // Rough cost signals against the documented free allowances. These are
  // approximations for orientation only — the providers bill on their own terms
  // and neither figure is authoritative.
  const TAVILY_FREE_CREDITS = 1000
  const creditsPct = Math.round((total.credits / TAVILY_FREE_CREDITS) * 100)
  const perRun = rows.filter((r) => r.credits > 0)
  const avgCredits = perRun.length
    ? Math.round((perRun.reduce((n, r) => n + r.credits, 0) / perRun.length) * 10) / 10
    : 0

  return NextResponse.json({
    total,
    runs: rows,
    estimates: {
      tavilyFreeCredits: TAVILY_FREE_CREDITS,
      creditsPctOfFreeTier: creditsPct,
      avgCreditsPerRun: avgCredits,
      // 0 once the average is unknown, rather than Infinity.
      runsRemainingOnFreeTier: avgCredits > 0 ? Math.floor(TAVILY_FREE_CREDITS / avgCredits) : 0,
    },
  })
}