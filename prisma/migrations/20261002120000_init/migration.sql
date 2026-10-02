-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "objective" TEXT,
    "fields" TEXT,
    "searchQueries" TEXT,
    "sourceStrategy" TEXT,
    "validationRules" TEXT,
    "tags" TEXT,
    "workflow" TEXT,
    "progress" TEXT,
    "stats" TEXT,
    "error" TEXT,
    "schedule" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" DATETIME,
    "startedAt" DATETIME,
    "runToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "templateId" TEXT,
    CONSTRAINT "Task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "valid" BOOLEAN NOT NULL DEFAULT true,
    "dedupeKey" TEXT,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DataItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "hostName" TEXT,
    "favicon" TEXT,
    "publishedTime" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "contentExcerpt" TEXT,
    "fetchStatus" TEXT NOT NULL DEFAULT 'pending',
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataSource_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "fields" TEXT,
    "tags" TEXT,
    "icon" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");

-- CreateIndex
CREATE INDEX "Task_trashedAt_idx" ON "Task"("trashedAt");

-- CreateIndex
CREATE INDEX "Task_pinned_idx" ON "Task"("pinned");

-- CreateIndex
CREATE INDEX "DataItem_taskId_idx" ON "DataItem"("taskId");

-- CreateIndex
CREATE INDEX "DataItem_dedupeKey_idx" ON "DataItem"("dedupeKey");

-- CreateIndex
CREATE INDEX "DataSource_taskId_idx" ON "DataSource"("taskId");

-- CreateIndex
CREATE INDEX "DataSource_hostName_idx" ON "DataSource"("hostName");

-- CreateIndex
CREATE INDEX "Template_isBuiltIn_idx" ON "Template"("isBuiltIn");

-- CreateIndex
CREATE INDEX "ActivityLog_taskId_idx" ON "ActivityLog"("taskId");

-- CreateIndex
CREATE INDEX "ActivityLog_type_idx" ON "ActivityLog"("type");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

