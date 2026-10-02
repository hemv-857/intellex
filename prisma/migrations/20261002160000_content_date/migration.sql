-- contentDate: stored per record so date filtering and latest-sorting run in SQL.
ALTER TABLE "DataItem" ADD COLUMN "contentDate" DATETIME;
CREATE INDEX "DataItem_contentDate_idx" ON "DataItem"("contentDate");
