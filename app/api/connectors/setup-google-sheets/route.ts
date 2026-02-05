/**
 * API: Setup Google Sheets Connector
 *
 * POST /api/connectors/setup-google-sheets
 *
 * Configures a customer's Google Sheets as their budget data source.
 * This includes:
 * 1. Selecting the spreadsheet and sheet
 * 2. AI-powered column mapping
 * 3. User confirmation of mappings
 * 4. Testing connection
 * 5. Activating the connector
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectorManager } from '@/lib/connectors/connector-manager';
import { GoogleSheetsBudgetConnector } from '@/lib/connectors/google-sheets-connector';
import { BudgetDataSourceConfig } from '@/lib/connectors/budget-data-source';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, spreadsheetId, sheetName, columnMappings, cacheTTL } = body;

    // Validation
    if (!customerId || !spreadsheetId || !columnMappings) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, spreadsheetId, columnMappings' },
        { status: 400 }
      );
    }

    // Verify required fields are mapped
    const requiredFields = ['department', 'fiscalPeriod', 'budgetedAmount'];
    const mappedFields = Object.values(columnMappings);

    for (const field of requiredFields) {
      if (!mappedFields.includes(field)) {
        return NextResponse.json(
          { error: `Required field "${field}" is not mapped` },
          { status: 400 }
        );
      }
    }

    // Setup connector
    const connector = await connectorManager.setupGoogleSheetsConnector(
      customerId,
      spreadsheetId,
      sheetName || 'Sheet1',
      columnMappings,
      cacheTTL || 300
    );

    // Test by fetching sample data
    const budgets = await connector.getAllBudgets(customerId);

    return NextResponse.json({
      success: true,
      message: 'Google Sheets connector configured successfully',
      budgetCount: budgets.length,
      sampleBudgets: budgets.slice(0, 3) // Return first 3 as preview
    });
  } catch (error: any) {
    console.error('[Setup Google Sheets] Error:', error);
    return NextResponse.json(
      { error: 'Failed to setup connector', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET - Get current connector configuration
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing customerId parameter' },
        { status: 400 }
      );
    }

    const config = await connectorManager.getConnectorConfig(customerId);

    if (!config) {
      return NextResponse.json({
        configured: false,
        type: null
      });
    }

    // Don't return sensitive credentials
    const safeConfig = {
      configured: true,
      type: config.type,
      enabled: config.enabled,
      sourceConfig: config.sourceConfig,
      columnMappings: config.columnMappings,
      cacheTTL: config.cacheTTL,
      lastSyncedAt: config.lastSyncedAt
    };

    return NextResponse.json(safeConfig);
  } catch (error: any) {
    console.error('[Get Connector Config] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get connector config', details: error.message },
      { status: 500 }
    );
  }
}
