-- Hand-authored on purpose.
--
-- `prisma migrate diff` cannot see the DataItemFts virtual table (Prisma does
-- not model virtual tables) and therefore reports it as drift, generating DROP
-- TABLE statements for the FTS table and all of its shadow tables. Do not
-- generate this file with migrate diff — write it by hand, or the search index
-- disappears.
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "label" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
CREATE INDEX "ShareLink_taskId_idx" ON "ShareLink"("taskId");
CREATE INDEX "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");