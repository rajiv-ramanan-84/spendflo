/**
 * File Sync Orchestrator
 *
 * Orchestrates the complete sync flow:
 * 1. Poll file source (SFTP/S3) for new files
 * 2. Download and parse files
 * 3. Use AI mapper to detect column mappings
 * 4. Execute sync with sync engine
 * 5. Update sync history
 *
 * Integrates:
 * - FileReceiver (SFTP/S3 polling)
 * - Enhanced AI Mapper (fuzzy column detection)
 * - Sync Engine (database import with fault tolerance)
 */

import { fileReceiver, FileSource, ReceivedFile } from './file-receiver';
import { suggestMappingsEnhanced } from '../ai/enhanced-mapping-engine';
import { syncEngine, BudgetData, SyncConfig, SyncResult } from './sync-engine';
import { prisma } from '../prisma';

export interface FileSyncConfig {
  customerId: string;
  sourceType: 'sftp' | 's3' | 'upload';
  fileSource: FileSource;
  autoApplyMapping: boolean; // If true, apply AI suggestions automatically
  minConfidence: number; // Minimum confidence to auto-apply (0-1)
}

export class FileSyncOrchestrator {
  /**
   * Execute complete file sync workflow
   */
  async executeFileSync(config: FileSyncConfig): Promise<SyncResult> {
    console.log(`[File Sync] Starting file sync for customer ${config.customerId}`);

    const startTime = new Date();

    try {
      // Step 1: Get last sync time
      const lastSync = await this.getLastSyncTime(config.customerId);
      console.log(`[File Sync] Last sync: ${lastSync?.toISOString() || 'Never'}`);

      // Step 2: Poll for new files
      const files = await fileReceiver.pollForNewFiles(config.fileSource, lastSync);

      if (files.length === 0) {
        console.log('[File Sync] No new files found');
        return this.createEmptySyncResult(config.customerId, startTime);
      }

      console.log(`[File Sync] Found ${files.length} new files`);

      // Step 3: Process most recent file (ignore older files)
      const latestFile = files.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
      console.log(`[File Sync] Processing latest file: ${latestFile.fileName}`);

      // Step 4: Parse file
      const rawData = await fileReceiver.parseFile(latestFile);
      console.log(`[File Sync] Parsed ${rawData.length} rows`);

      if (rawData.length === 0) {
        throw new Error('File is empty or has no data rows');
      }

      // Step 5: Detect column mappings using AI
      const headers = Object.keys(rawData[0]);
      const sampleRows = rawData.slice(0, 10); // Use first 10 rows for detection

      console.log('[File Sync] Detecting column mappings...');
      const mappingResult = suggestMappingsEnhanced(headers, sampleRows);

      console.log(`[File Sync] Mapping confidence: ${Math.round(mappingResult.overallConfidence * 100)}%`);
      console.log('[File Sync] Detected mappings:', mappingResult.mappings.map(m =>
        `${m.sourceColumn} → ${m.targetField} (${Math.round(m.confidence * 100)}%)`
      ));

      // Step 6: Check if confidence is sufficient
      if (mappingResult.overallConfidence < config.minConfidence && !config.autoApplyMapping) {
        throw new Error(
          `Column mapping confidence (${Math.round(mappingResult.overallConfidence * 100)}%) ` +
          `is below threshold (${Math.round(config.minConfidence * 100)}%). ` +
          'Manual review required.'
        );
      }

      // Step 7: Transform data using detected mappings
      const budgetData = this.transformData(rawData, mappingResult.mappings);
      console.log(`[File Sync] Transformed ${budgetData.length} budget records`);

      // Step 8: Execute sync with sync engine
      const syncConfig: SyncConfig = {
        customerId: config.customerId,
        sourceType: config.sourceType as any,
        sourceConfig: {
          fileName: latestFile.fileName,
          filePath: latestFile.filePath,
          columnMappings: this.extractColumnMappings(mappingResult.mappings)
        },
        frequency: 'manual',
        enabled: true
      };

      // Create a modified sync engine call that uses our budget data
      const result = await this.executeSyncWithData(syncConfig, budgetData, latestFile);

      console.log(`[File Sync] Sync completed: ${result.status}`);
      console.log(`[File Sync] Stats:`, result.stats);

      return result;

    } catch (error: any) {
      console.error('[File Sync] Sync failed:', error);
      throw error;
    }
  }

  /**
   * Transform raw data using AI mappings
   */
  private transformData(
    rawData: Array<Record<string, any>>,
    mappings: Array<{ sourceColumn: string; targetField: string; confidence: number }>
  ): BudgetData[] {
    const budgetData: BudgetData[] = [];

    // Create mapping lookup
    const columnMap: Record<string, string> = {};
    for (const mapping of mappings) {
      columnMap[mapping.targetField] = mapping.sourceColumn;
    }

    for (const row of rawData) {
      try {
        const budget: Partial<BudgetData> = {};

        // Map each field
        if (columnMap.department) {
          budget.department = String(row[columnMap.department] || '').trim();
        }

        if (columnMap.subCategory) {
          budget.subCategory = String(row[columnMap.subCategory] || '').trim() || undefined;
        }

        if (columnMap.fiscalPeriod) {
          budget.fiscalPeriod = String(row[columnMap.fiscalPeriod] || '').trim();
        }

        if (columnMap.budgetedAmount) {
          const amountStr = String(row[columnMap.budgetedAmount] || '0');
          // Remove currency symbols and commas
          const cleanAmount = amountStr.replace(/[$,€£¥]/g, '').trim();
          budget.budgetedAmount = parseFloat(cleanAmount) || 0;
        }

        if (columnMap.currency) {
          budget.currency = String(row[columnMap.currency] || 'USD').trim();
        } else {
          budget.currency = 'USD'; // Default
        }

        // Validate required fields
        if (budget.department && budget.fiscalPeriod && budget.budgetedAmount !== undefined) {
          budgetData.push(budget as BudgetData);
        }

      } catch (error) {
        console.warn('[File Sync] Failed to transform row:', error);
        // Skip invalid rows
      }
    }

    return budgetData;
  }

  /**
   * Execute sync with pre-parsed budget data
   */
  private async executeSyncWithData(
    config: SyncConfig,
    budgetData: BudgetData[],
    file: ReceivedFile
  ): Promise<SyncResult> {
    const syncId = `sync_${Date.now()}_${config.customerId}`;
    const startTime = new Date();

    const result: SyncResult = {
      syncId,
      customerId: config.customerId,
      status: 'success',
      startTime,
      endTime: new Date(),
      durationMs: 0,
      stats: {
        totalRows: budgetData.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        softDeleted: 0,
        errors: 0
      },
      errors: [],
      metadata: {
        sourceType: config.sourceType,
        fetchedAt: file.receivedAt,
        processedBy: 'file-sync-orchestrator-v1'
      }
    };

    try {
      // Import budgets to database
      const importResult = await (syncEngine as any).importBudgets(
        config.customerId,
        budgetData,
        result.metadata
      );

      // Update stats
      result.stats.created = importResult.created;
      result.stats.updated = importResult.updated;
      result.stats.unchanged = importResult.unchanged;
      result.stats.softDeleted = importResult.softDeleted;
      result.stats.errors = importResult.errors.length;
      result.errors = importResult.errors;

      // Determine overall status
      if (result.stats.errors === 0) {
        result.status = 'success';
      } else if (result.stats.errors < result.stats.totalRows) {
        result.status = 'partial';
      } else {
        result.status = 'failed';
      }

      // Create sync history
      await this.createSyncHistory(result, config, file);

    } catch (error: any) {
      console.error(`[File Sync] Import failed:`, error);
      result.status = 'failed';
      result.errors.push({
        error: error.message || 'Unknown error',
        severity: 'error'
      });
    } finally {
      result.endTime = new Date();
      result.durationMs = result.endTime.getTime() - startTime.getTime();
    }

    return result;
  }

  /**
   * Get last sync time for customer
   */
  private async getLastSyncTime(customerId: string): Promise<Date | null> {
    try {
      const lastSync = await prisma.syncHistory.findFirst({
        where: { customerId },
        orderBy: { startTime: 'desc' }
      });

      return lastSync ? lastSync.endTime : null;
    } catch (error) {
      console.warn('[File Sync] Failed to get last sync time:', error);
      return null;
    }
  }

  /**
   * Create sync history record
   */
  private async createSyncHistory(
    result: SyncResult,
    config: SyncConfig,
    file: ReceivedFile
  ): Promise<void> {
    try {
      // Get config ID
      const dataSourceConfig = await prisma.budgetDataSourceConfig.findFirst({
        where: {
          customerId: config.customerId,
          sourceType: config.sourceType
        }
      });

      if (!dataSourceConfig) {
        console.warn('[File Sync] No data source config found, skipping history');
        return;
      }

      await prisma.syncHistory.create({
        data: {
          customerId: config.customerId,
          configId: dataSourceConfig.id,
          syncId: result.syncId,
          status: result.status,
          startTime: result.startTime,
          endTime: result.endTime,
          durationMs: result.durationMs,
          totalRows: result.stats.totalRows,
          createdCount: result.stats.created,
          updatedCount: result.stats.updated,
          unchangedCount: result.stats.unchanged,
          softDeletedCount: result.stats.softDeleted,
          errorCount: result.stats.errors,
          errors: result.errors.length > 0 ? result.errors : null,
          sourceType: config.sourceType,
          triggeredBy: 'file_poll',
          metadata: {
            fileName: file.fileName,
            fileSize: file.fileSize,
            receivedAt: file.receivedAt,
            ...file.metadata
          }
        }
      });

      console.log('[File Sync] Sync history saved');

    } catch (error) {
      console.error('[File Sync] Failed to create sync history:', error);
      // Don't throw - sync completed, just logging failed
    }
  }

  /**
   * Extract column mappings as simple object
   */
  private extractColumnMappings(
    mappings: Array<{ sourceColumn: string; targetField: string }>
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const mapping of mappings) {
      result[mapping.sourceColumn] = mapping.targetField;
    }
    return result;
  }

  /**
   * Create empty sync result when no files found
   */
  private createEmptySyncResult(customerId: string, startTime: Date): SyncResult {
    return {
      syncId: `sync_${Date.now()}_${customerId}`,
      customerId,
      status: 'success',
      startTime,
      endTime: new Date(),
      durationMs: 0,
      stats: {
        totalRows: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        softDeleted: 0,
        errors: 0
      },
      errors: [],
      metadata: {
        sourceType: 'file_drop',
        fetchedAt: new Date(),
        processedBy: 'file-sync-orchestrator-v1'
      }
    };
  }
}

// Singleton instance
export const fileSyncOrchestrator = new FileSyncOrchestrator();
