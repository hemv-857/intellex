// The quality-score formula from ./quality.ts, expressed as SQL so the insights
// trend can be averaged by SQLite instead of in JS.
//
// Exported as plain text and embedded with Prisma.raw() rather than Prisma.sql():
// it references no user input (only json_extract over a column we own), and
// tests/quality-sql.test.ts executes this exact string in a real SQLite engine
// to prove it cannot drift from the TypeScript implementation.

// The status guard is part of the expression, not just the caller's WHERE, so
// this fragment is exactly equivalent to qualityScore() in quality.ts for any row
// — which is what the equivalence test asserts.
export const qualityScoreSqlText = `(
  CASE WHEN t.status = 'completed'
        AND COALESCE(json_extract(t.stats, '$.items'), 0) > 0 THEN
    MIN(100, MAX(0, ROUND(
      (COALESCE(json_extract(t.stats, '$.valid'), 0) * 1.0
        / COALESCE(json_extract(t.stats, '$.items'), 1)) * 50
      + MIN(1.0, COALESCE(json_extract(t.stats, '$.sources'), 0) / 8.0) * 25
      -- json_extract yields INTEGERs, and SQLite divides two integers to an
      -- integer. The * 1.0 forces real division; without it every duplicate
      -- penalty silently became 0.
      + (1.0 - MIN(1.0, COALESCE(json_extract(t.stats, '$.duplicates'), 0) * 1.0
                          / COALESCE(json_extract(t.stats, '$.items'), 1))) * 25
    )))
  ELSE 0 END)`