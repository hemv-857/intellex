/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { qualityScore } from '../src/lib/quality'
import { qualityScoreSqlText } from '../src/lib/quality-sql'

// The insights trend computes quality in SQL while every other view computes it
// in TypeScript. This executes the exact production SQL fragment against a real
// SQLite engine over the same fixtures, so the two cannot silently diverge.

type Stats = { items?: number; valid?: number; sources?: number; duplicates?: number }

const FIXTURES: Array<{ label: string; status: string; stats: Stats }> = [
  { label: 'perfect', status: 'completed', stats: { items: 10, valid: 10, sources: 8, duplicates: 0 } },
  { label: 'mostly valid', status: 'completed', stats: { items: 10, valid: 8, sources: 8, duplicates: 0 } },
  { label: 'low quality', status: 'completed', stats: { items: 25, valid: 1, sources: 8, duplicates: 5 } },
  { label: 'one duplicate', status: 'completed', stats: { items: 6, valid: 6, sources: 8, duplicates: 1 } },
  { label: 'real headphones task', status: 'completed', stats: { items: 22, valid: 15, sources: 8, duplicates: 0 } },
  { label: 'drifted stats (dups > items)', status: 'completed', stats: { items: 10, valid: 8, sources: 4, duplicates: 14 } },
  { label: 'nothing valid', status: 'completed', stats: { items: 3, valid: 0, sources: 0, duplicates: 0 } },
  { label: 'large', status: 'completed', stats: { items: 100, valid: 99, sources: 20, duplicates: 0 } },
  { label: 'single record', status: 'completed', stats: { items: 1, valid: 1, sources: 1, duplicates: 0 } },
  { label: 'not completed', status: 'planned', stats: { items: 5, valid: 5, sources: 5, duplicates: 0 } },
  { label: 'missing keys', status: 'completed', stats: {} },
]

describe('quality score: production SQL matches the TypeScript implementation', () => {
  const db = new Database(':memory:')
  db.run('CREATE TABLE t (stats TEXT, status TEXT DEFAULT \'completed\')')

  const sqlScoreFor = (stats: Stats): number => {
    const row = db
      .query(`SELECT ${qualityScoreSqlText} AS score FROM t WHERE stats = ? LIMIT 1`)
      .get(JSON.stringify(stats)) as { score: number } | undefined
    return row ? Number(row.score) : Number.NaN
  }

  for (const f of FIXTURES) {
    test(`${f.label}: items=${f.stats.items ?? 0} valid=${f.stats.valid ?? 0}`, () => {
      db.run('DELETE FROM t')
      db.run('INSERT INTO t (stats, status) VALUES (?, ?)', [JSON.stringify(f.stats), f.status])
      const fromSql = sqlScoreFor(f.stats)
      const fromTs = qualityScore({
        status: f.status,
        items: Number(f.stats.items ?? 0),
        valid: Number(f.stats.valid ?? 0),
        sources: Number(f.stats.sources ?? 0),
        duplicates: Number(f.stats.duplicates ?? 0),
      })
      expect(fromSql).toBe(fromTs)
    })
  }

  test('the SQL fragment is not accidentally interpolating anything', () => {
    // Guards the Prisma.raw() usage: it must stay a pure expression.
    expect(qualityScoreSqlText.startsWith('(')).toBe(true)
    expect(qualityScoreSqlText).not.toContain('${')
  })
})