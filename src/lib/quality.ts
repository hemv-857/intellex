import type { TaskStats } from './ai'

// The quality score had two implementations (tasks list and compare) that
// rounded at different points, so the same task could show 65 in one view and 55
// in the other. One definition, used by both.

export const FULL_COVERAGE_SOURCES = 8 // sources needed for full source-coverage credit

export type QualityInput = {
  status: string
  items: number
  valid: number
  sources: number
  duplicates: number
}

export function validityRate(i: { items: number; valid: number }): number {
  return i.items > 0 ? i.valid / i.items : 0
}

export function duplicateRate(i: { items: number; duplicates: number }): number {
  return i.items > 0 ? Math.min(1, i.duplicates / i.items) : 0
}

export function sourceCoverage(sources: number): number {
  return Math.min(1, sources / FULL_COVERAGE_SOURCES)
}

/** 0-100. validity x50 + source coverage x25 + (1 - duplicate rate) x25. */
export function qualityScore(input: QualityInput): number {
  if (input.status !== 'completed' || input.items <= 0) return 0
  const raw =
    validityRate(input) * 50 +
    sourceCoverage(input.sources) * 25 +
    (1 - duplicateRate(input)) * 25
  // Clamp: stale stats can report more duplicates than items, which used to
  // produce a negative contribution and two disagreeing scores.
  return Math.max(0, Math.min(100, Math.round(raw)))
}

/** Reads the score inputs off a task row, tolerating a missing or unparsed stats blob. */
export function qualityInputFromTask(t: {
  status: string
  stats?: unknown
  _count?: { dataItems?: number; sources?: number }
}): QualityInput {
  // `stats` is a JSON *string* on the row but callers routinely already hold the
  // parsed object. Accept either — passing the string through silently scored
  // validity as 0 and made this view disagree with the compare view.
  let stats: Partial<TaskStats> = {}
  if (typeof t.stats === 'string') {
    try {
      stats = JSON.parse(t.stats)
    } catch {
      stats = {}
    }
  } else if (t.stats && typeof t.stats === 'object') {
    stats = t.stats as Partial<TaskStats>
  }

  return {
    status: t.status,
    items: Number(stats.items ?? t._count?.dataItems ?? 0) || 0,
    valid: Number(stats.valid ?? 0) || 0,
    sources: Number(stats.sources ?? t._count?.sources ?? 0) || 0,
    duplicates: Number(stats.duplicates ?? 0) || 0,
  }
}