/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { qualityScore, validityRate, duplicateRate, sourceCoverage, qualityInputFromTask } from '../src/lib/quality'

describe('quality score', () => {
  const base = { status: 'completed', items: 10, valid: 8, sources: 8, duplicates: 0 }

  test('a perfect task scores 100', () => {
    expect(qualityScore({ ...base, valid: 10 })).toBe(100)
  })

  test('is 0 for a task with no records or that never completed', () => {
    expect(qualityScore({ ...base, items: 0 })).toBe(0)
    expect(qualityScore({ ...base, status: 'planned' })).toBe(0)
    expect(qualityScore({ ...base, status: 'failed' })).toBe(0)
  })

  test('weights validity 50, coverage 25 and non-duplication 25', () => {
    // validity 0.8*50=40, coverage 8/8*25=25, dup 0 -> 25 => 90
    expect(qualityScore(base)).toBe(90)
    // half the records valid, one source, a quarter duplicates
    // 0.5*50=25 + (1/8)*25=3.125 + 0.75*25=18.75 = 46.875 -> 47
    expect(qualityScore({ ...base, valid: 5, sources: 1, duplicates: 2.5 })).toBe(47)
  })

  test('clamps instead of going negative when stats drift (dups > items)', () => {
    // The old per-route implementations disagreed here: 65 vs 55. One clamped
    // function cannot disagree with itself.
    const drifted = { status: 'completed', items: 10, valid: 8, sources: 4, duplicates: 14 }
    const score = qualityScore(drifted)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBe(qualityScore(drifted))
  })

  test('is deterministic for identical input', () => {
    expect(qualityScore(base)).toBe(qualityScore({ ...base }))
  })

  test('component helpers agree with the composite', () => {
    expect(validityRate({ items: 10, valid: 8 })).toBeCloseTo(0.8)
    expect(duplicateRate({ items: 10, duplicates: 5 })).toBeCloseTo(0.5)
    expect(sourceCoverage(8)).toBe(1)
    expect(sourceCoverage(100)).toBe(1) // capped
    expect(sourceCoverage(0)).toBe(0)
  })
})
describe('qualityInputFromTask', () => {
  const expected = { status: 'completed', items: 6, valid: 6, sources: 8, duplicates: 1 }

  test('accepts the parsed stats object', () => {
    expect(
      qualityInputFromTask({ status: 'completed', stats: { items: 6, valid: 6, sources: 8, duplicates: 1, tokens: 0 } }),
    ).toEqual(expected)
  })

  test('accepts the raw JSON string a Task row actually carries', () => {
    // This was the live bug: passing the string scored validity as 0, so the
    // task list showed 50 while compare showed 96 for the same task.
    expect(
      qualityInputFromTask({ status: 'completed', stats: '{"items":6,"valid":6,"sources":8,"duplicates":1,"tokens":4360576}' }),
    ).toEqual(expected)
  })

  test('falls back to live counts when stats is missing or unparseable', () => {
    const counts = { dataItems: 4, sources: 3 }
    expect(qualityInputFromTask({ status: 'completed', stats: null, _count: counts })).toEqual({
      status: 'completed', items: 4, valid: 0, sources: 3, duplicates: 0,
    })
    expect(qualityInputFromTask({ status: 'completed', stats: 'not json', _count: counts }).items).toBe(4)
  })

  test('both shapes produce the same score', () => {
      const a = qualityScore(qualityInputFromTask({ status: 'completed', stats: { items: 6, valid: 6, sources: 8, duplicates: 1, tokens: 0 } }))
    const b = qualityScore(qualityInputFromTask({ status: 'completed', stats: '{"items":6,"valid":6,"sources":8,"duplicates":1}' }))
    expect(a).toBe(b)
    expect(a).toBe(96)
  })
})
