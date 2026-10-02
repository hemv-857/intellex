import { db } from '@/lib/db'

// The FTS5 index is a SQLite *virtual* table, which Prisma cannot model — so
// `prisma migrate diff` sees it as drift and will happily generate DROP TABLE
// statements for it and its shadow tables. Two safeguards:
//
//  1. Migrations here are hand-authored; never pipe `prisma migrate diff` output
//     into the database without reading it.
//  2. This module recreates the index if it is missing, so a lost index heals on
//     next boot instead of silently turning search into a no-op.
//
// Every statement is static SQL — no interpolation, no user input.

const ENSURE_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS DataItemFts USING fts5(
  itemId UNINDEXED,
  title,
  summary,
  body,
  taskTitle,
  tags,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS dataitem_fts_ai AFTER INSERT ON DataItem BEGIN
  INSERT INTO DataItemFts(rowid, itemId, title, summary, body, taskTitle, tags)
  SELECT new.rowid, new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''), COALESCE(new.data, ''),
         COALESCE((SELECT title FROM Task WHERE id = new.taskId), ''),
         COALESCE((SELECT tags FROM Task WHERE id = new.taskId), '');
END;

CREATE TRIGGER IF NOT EXISTS dataitem_fts_ad AFTER DELETE ON DataItem BEGIN
  DELETE FROM DataItemFts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS dataitem_fts_au AFTER UPDATE ON DataItem BEGIN
  DELETE FROM DataItemFts WHERE rowid = old.rowid;
  INSERT INTO DataItemFts(rowid, itemId, title, summary, body, taskTitle, tags)
  SELECT new.rowid, new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''), COALESCE(new.data, ''),
         COALESCE((SELECT title FROM Task WHERE id = new.taskId), ''),
         COALESCE((SELECT tags FROM Task WHERE id = new.taskId), '');
END;
`

let ensured: Promise<void> | null = null

/** Creates the FTS table and triggers if absent. Cheap and idempotent. */
export function ensureFtsIndex(): Promise<void> {
  if (!ensured) {
    ensured = db
      .$executeRawUnsafe(ENSURE_SQL)
      .then(() => undefined)
      .catch((e) => {
        // Reset so a later attempt can retry rather than caching the failure.
        ensured = null
        throw e
      })
  }
  return ensured
}

/** True when the index exists and its row count matches DataItem. */
export async function ftsIsHealthy(): Promise<boolean> {
  try {
    await ensureFtsIndex()
    const [indexed] = await db.$queryRawUnsafe<{ n: number }[]>('SELECT COUNT(*) AS n FROM DataItemFts')
    const [total] = await db.$queryRawUnsafe<{ n: number }[]>('SELECT COUNT(*) AS n FROM DataItem')
    return Number(indexed?.n ?? 0) === Number(total?.n ?? 0)
  } catch {
    return false
  }
}