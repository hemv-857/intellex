-- DropIndex
DROP INDEX "Task_pinned_idx";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "completedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Task_trashedAt_pinned_createdAt_idx" ON "Task"("trashedAt", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "Task_schedule_idx" ON "Task"("schedule");

-- CreateIndex
CREATE INDEX "DataItem_taskId_createdAt_idx" ON "DataItem"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "DataItem_confidence_idx" ON "DataItem"("confidence");

-- CreateIndex
CREATE INDEX "DataItem_sourceId_idx" ON "DataItem"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DataItem_taskId_dedupeKey_key" ON "DataItem"("taskId", "dedupeKey");

-- CreateIndex
CREATE INDEX "DataSource_taskId_rank_idx" ON "DataSource"("taskId", "rank");

-- CreateIndex
CREATE INDEX "DataSource_fetchStatus_idx" ON "DataSource"("fetchStatus");

-- CreateIndex
CREATE INDEX "DataSource_createdAt_idx" ON "DataSource"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_taskId_url_key" ON "DataSource"("taskId", "url");

