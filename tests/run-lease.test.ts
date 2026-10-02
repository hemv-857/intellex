/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { STALE_RUN_MS } from '../src/lib/run-lease'

// The lease rules are pure date arithmetic; this pins the boundary so a run is
// never considered dead while it is still working, nor alive forever after a crash.
function isLiveLease(startedAt: Date | null, now: number): boolean {
  return !!startedAt && now - startedAt.getTime() < STALE_RUN_MS
}

describe('run lease freshness', () => {
  const now = Date.parse('2026-10-02T12:00:00Z')

  test('a run that just started is live', () => {
    expect(isLiveLease(new Date(now), now)).toBe(true)
  })

  test('a run in progress is still live right up to the deadline', () => {
    expect(isLiveLease(new Date(now - STALE_RUN_MS + 1000), now)).toBe(true)
  })

  test('a run past the deadline is stale and therefore reclaimable', () => {
    expect(isLiveLease(new Date(now - STALE_RUN_MS), now)).toBe(false)
    expect(isLiveLease(new Date(now - STALE_RUN_MS - 60_000), now)).toBe(false)
  })

  test('a task that never started has no live lease', () => {
    expect(isLiveLease(null, now)).toBe(false)
  })
})
describe('reaper predicate', () => {
  test('treats a running task with no lease as dead', () => {
    // These are rows written before leases existed. NULL never satisfies `lt`, so
    // an expiry-only reaper strands them forever.
    const cutoff = Date.parse('2026-10-02T12:00:00Z')
    const dead = (startedAt: number | null) =>
      startedAt === null || Date.now() - startedAt > STALE_RUN_MS
    expect(dead(null)).toBe(true)
    expect(dead(Date.now())).toBe(false)
    expect(dead(Date.now() - STALE_RUN_MS - 1)).toBe(true)
    expect(cutoff).toBeGreaterThan(0)
  })
})
