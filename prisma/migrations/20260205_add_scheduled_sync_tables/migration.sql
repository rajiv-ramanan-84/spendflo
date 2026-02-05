-- AlterTable: Add deletedAt to Budget for soft deletes
ALTER TABLE "Budget" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex: Index on deletedAt for efficient queries
CREATE INDEX "Budget_deletedAt_idx" ON "Budget"("deletedAt");

-- CreateTable: BudgetDataSourceConfig - stores sync configuration
CREATE TABLE "BudgetDataSourceConfig" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'every_4_hours',
    "sourceConfig" JSONB NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "nextSyncAt" TIMESTAMP(3),
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetDataSourceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SyncHistory - tracks all sync executions
CREATE TABLE "SyncHistory" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "syncId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "softDeletedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "sourceType" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Indexes for BudgetDataSourceConfig
CREATE INDEX "BudgetDataSourceConfig_customerId_idx" ON "BudgetDataSourceConfig"("customerId");
CREATE INDEX "BudgetDataSourceConfig_enabled_idx" ON "BudgetDataSourceConfig"("enabled");
CREATE INDEX "BudgetDataSourceConfig_nextSyncAt_idx" ON "BudgetDataSourceConfig"("nextSyncAt");

-- CreateIndex: Indexes for SyncHistory
CREATE UNIQUE INDEX "SyncHistory_syncId_key" ON "SyncHistory"("syncId");
CREATE INDEX "SyncHistory_customerId_idx" ON "SyncHistory"("customerId");
CREATE INDEX "SyncHistory_configId_idx" ON "SyncHistory"("configId");
CREATE INDEX "SyncHistory_status_idx" ON "SyncHistory"("status");
CREATE INDEX "SyncHistory_startTime_idx" ON "SyncHistory"("startTime");

-- AddForeignKey: Link BudgetDataSourceConfig to Customer
ALTER TABLE "BudgetDataSourceConfig" ADD CONSTRAINT "BudgetDataSourceConfig_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Link SyncHistory to Customer
ALTER TABLE "SyncHistory" ADD CONSTRAINT "SyncHistory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Link SyncHistory to BudgetDataSourceConfig
ALTER TABLE "SyncHistory" ADD CONSTRAINT "SyncHistory_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BudgetDataSourceConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
