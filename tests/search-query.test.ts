/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { buildMatchExpression, isUsableExpression } from '../src/lib/search-query'

describe('FTS match expression', () => {
  test('ORs the meaningful tokens', () => {
    expect(buildMatchExpression(['venture capital'])).toBe('"venture" OR "capital"')
  })

  test('strips stopwords and short tokens', () => {
    expect(buildMatchExpression(['find all the startups'])).toBe('"startups"')
    expect(buildMatchExpression(['a of to'])).toBeNull()
  })

  test('never lets FTS operators through', () => {
    // Raw pasting would make this a syntax error or a pathological query.
    // Every surviving token becomes a quoted literal, so FTS keywords in the
    // input ("MATCH", the table name) are matched as words rather than executed.
    expect(buildMatchExpression(['foo" OR DataItemFts MATCH "bar'])).toBe('"foo" OR "dataitemfts" OR "match" OR "bar"')
    expect(buildMatchExpression(['NEAR(a b)'])).toBe('"near"') // "a"/"b" are single chars, dropped
    expect(buildMatchExpression(['title:*'])).toBe('"title"')
    expect(buildMatchExpression(['^abc'])).toBe('"abc"')
  })

  test('deduplicates case-insensitively', () => {
    expect(buildMatchExpression(['Cursor', 'cursor', 'CURSOR'])).toBe('"cursor"')
  })

  test('caps runaway term counts', () => {
    const many = Array.from({ length: 200 }, (_, i) => `term${i}`)
    const expr = buildMatchExpression(many)!
    expect(expr.split(' OR ').length).toBeLessThanOrEqual(24)
  })

  test('handles non-latin text', () => {
    expect(buildMatchExpression(['Bengaluru 東京'])).toBe('"bengaluru" OR "東京"')
  })

  test('reports unusable expressions', () => {
    expect(isUsableExpression(buildMatchExpression(['', '   ']))).toBe(false)
    expect(isUsableExpression(buildMatchExpression(['cursor']))).toBe(true)
  })
})