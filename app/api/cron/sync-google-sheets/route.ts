/**
 * Google Sheets Sync Cron Job
 *
 * GET /api/cron/sync-google-sheets
 *
 * Syncs budget data from Google Sheets for all customers who have
 * Google Sheets as their budget source.
 *
 * Runs every hour via Vercel Cron.
 *
 * Security: Requires CRON_SECRET in Authorization header
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GoogleSheetsBudgetConnector } from '@/lib/connectors/google-sheets-connector';

// Route segment config for Vercel Cron
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function GET(req: NextRequest) {
  try {
    // SECURITY: Verify cron secret
    const authHeader = req.headers.get('Authorization');
    const expectedAuth = 'Bearer ' + process.env.CRON_SECRET;

    if (!process.env.CRON_SECRET) {
      console.error('[Cron Sync] CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== expectedAuth) {
      console.warn('[Cron Sync] Unauthorized cron attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Cron Sync] Starting Google Sheets sync...');
    const startTime = Date.now();

    // Find all active Google Sheets data source configs
    const configs = await prisma.budgetDataSourceConfig.findMany({
      where: {
        sourceType: 'google_sheets',
        enabled: true,
      },
      include: {
        customer: true,
      },
    });

    console.log('[Cron Sync] Found ' + configs.length + ' Google Sheets configurations');

    const results = [];

    for (const config of configs) {
      const syncStartTime = Date.now();
      const syncId = 'sync_' + Date.now() + '_' + config.customerId;

      console.log('[Cron Sync] Syncing ' + config.customer.name + ' (' + config.id + ')...');

      try {
        const result = await syncGoogleSheetForConfig(config, syncId);
        results.push(result);
        console.log('[Cron Sync] Success: Synced ' + config.customer.name + ': ' + result.status);
      } catch (error: any) {
        console.error('[Cron Sync] Failed ' + config.customer.name + ':', error.message);
        results.push({
          customerId: config.customerId,
          configId: config.id,
          status: 'failed',
          error: error.message,
          durationMs: Date.now() - syncStartTime,
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    console.log('[Cron Sync] Completed: ' + successCount + ' success, ' + failureCount + ' failed in ' + totalDuration + 'ms');

    return NextResponse.json({
      success: true,
      totalConfigs: configs.length,
      successCount,
      failureCount,
      durationMs: totalDuration,
      results,
    });
  } catch (error: any) {
    console.error('[Cron Sync] Error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Sync a single Google Sheet configuration
 */
async function syncGoogleSheetForConfig(
  config: any,
  syncId: string
): Promise<any> {
  const startTime = new Date();
  const syncStartMs = Date.now();

  try {
    // Create Google Sheets connector
    const connector = new GoogleSheetsBudgetConnector({
      type: 'google_sheets',
      customerId: config.customerId,
      enabled: true,
      credentials: config.credentials,
      sourceConfig: config.sourceConfig,
      columnMappings: config.columnMappings,
      cacheTTL: 3600,
    });

    // Fetch all budgets from Google Sheet
    const budgets = await connector.getAllBudgets(config.customerId);

    console.log('[Sync] Fetched ' + budgets.length + ' budgets from sheet');

    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let softDeletedCount = 0;
    const errors = [];

    // Get existing budgets from database
    const existingBudgets = await prisma.budget.findMany({
      where: {
        customerId: config.customerId,
        source: 'google_sheets',
        deletedAt: null,
      },
    });

    // Create a map of existing budgets for quick lookup
    const existingMap = new Map(
      existingBudgets.map(b => [
        b.department + '|' + (b.subCategory || '') + '|' + b.fiscalPeriod,
        b,
      ])
    );

    // Track which budgets we've seen in the sheet
    const seenKeys = new Set<string>();

    // Upsert budgets from sheet
    for (const budget of budgets) {
      const key = budget.department + '|' + (budget.subCategory || '') + '|' + budget.fiscalPeriod;
      seenKeys.add(key);

      try {
        const existing = existingMap.get(key);

        if (!existing) {
          // Create new budget
          await prisma.budget.create({
            data: {
              customerId: config.customerId,
              department: budget.department,
              subCategory: budget.subCategory,
              fiscalPeriod: budget.fiscalPeriod,
              budgetedAmount: budget.budgetedAmount,
              currency: budget.currency || 'USD',
              source: 'google_sheets',
            },
          });
          createdCount++;
        } else if (existing.budgetedAmount !== budget.budgetedAmount) {
          // Update if amount changed
          await prisma.budget.update({
            where: { id: existing.id },
            data: {
              budgetedAmount: budget.budgetedAmount,
              updatedAt: new Date(),
            },
          });
          updatedCount++;
        } else {
          // No change
          unchangedCount++;
        }
      } catch (error: any) {
        errors.push({
          budget: key,
          error: error.message,
          severity: 'error',
        });
      }
    }

    // Soft delete budgets that are no longer in the sheet
    for (const [key, existing] of existingMap.entries()) {
      if (!seenKeys.has(key)) {
        await prisma.budget.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });
        softDeletedCount++;
      }
    }

    const endTime = new Date();
    const durationMs = Date.now() - syncStartMs;

    // Record sync history
    await prisma.syncHistory.create({
      data: {
        syncId,
        customerId: config.customerId,
        configId: config.id,
        status: errors.length > 0 ? 'partial' : 'success',
        startTime,
        endTime,
        durationMs,
        totalRows: budgets.length,
        createdCount,
        updatedCount,
        unchangedCount,
        softDeletedCount,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        sourceType: 'google_sheets',
        triggeredBy: 'cron',
      },
    });

    return {
      customerId: config.customerId,
      configId: config.id,
      syncId,
      status: errors.length > 0 ? 'partial' : 'success',
      stats: {
        totalRows: budgets.length,
        created: createdCount,
        updated: updatedCount,
        unchanged: unchangedCount,
        softDeleted: softDeletedCount,
        errors: errors.length,
      },
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - syncStartMs;

    // Record failed sync
    await prisma.syncHistory.create({
      data: {
        syncId,
        customerId: config.customerId,
        configId: config.id,
        status: 'failed',
        startTime,
        endTime: new Date(),
        durationMs,
        totalRows: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        softDeletedCount: 0,
        errorCount: 1,
        errors: [{ error: error.message, severity: 'fatal' }],
        sourceType: 'google_sheets',
        triggeredBy: 'cron',
      },
    });

    throw error;
  }
}
