-- Full-text search over DataItem, maintained by triggers so it can never drift
-- from the table it mirrors. Search previously loaded every record of every
-- completed task into Node to score in JS (~1.65s and ~192MB at 100k rows);
-- this moves matching into SQLite and bounds what the app ever loads.
--
-- taskTitle and tags are denormalised in because the previous scorer weighted
-- them (taskTitle=3, tag=3) and records frequently omit words that only exist
-- on their parent task — searching "engineer vacancies" must match records whose
-- data says "engineer" under a task titled "... Vacancies".
CREATE VIRTUAL TABLE DataItemFts USING fts5(
  itemId UNINDEXED,
  title,
  summary,
  body,
  taskTitle,
  tags,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER dataitem_fts_ai AFTER INSERT ON DataItem BEGIN
  INSERT INTO DataItemFts(rowid, itemId, title, summary, body, taskTitle, tags)
  SELECT new.rowid, new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''), COALESCE(new.data, ''),
         COALESCE((SELECT title FROM Task WHERE id = new.taskId), ''),
         COALESCE((SELECT tags FROM Task WHERE id = new.taskId), '');
END;

-- Plain DELETE, not the FTS5 'delete' command: that command rejects a value in
-- an UNINDEXED column, and itemId is UNINDEXED. Removing by rowid is the
-- supported form for a content-storing FTS5 table.
CREATE TRIGGER dataitem_fts_ad AFTER DELETE ON DataItem BEGIN
  DELETE FROM DataItemFts WHERE rowid = old.rowid;
END;

CREATE TRIGGER dataitem_fts_au AFTER UPDATE ON DataItem BEGIN
  DELETE FROM DataItemFts WHERE rowid = old.rowid;
  INSERT INTO DataItemFts(rowid, itemId, title, summary, body, taskTitle, tags)
  SELECT new.rowid, new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''), COALESCE(new.data, ''),
         COALESCE((SELECT title FROM Task WHERE id = new.taskId), ''),
         COALESCE((SELECT tags FROM Task WHERE id = new.taskId), '');
END;

-- Backfill rows that predate the index.
INSERT INTO DataItemFts(rowid, itemId, title, summary, body, taskTitle, tags)
SELECT d.rowid, d.id, COALESCE(d.title, ''), COALESCE(d.summary, ''), COALESCE(d.data, ''),
       COALESCE(t.title, ''), COALESCE(t.tags, '')
FROM DataItem d LEFT JOIN Task t ON t.id = d.taskId;
