/**
 * API: Discover Schema
 *
 * POST /api/connectors/discover-schema
 *
 * Analyzes a customer's Google Sheet and suggests column mappings using AI.
 * This is step 1 in the connector setup flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsBudgetConnector } from '@/lib/connectors/google-sheets-connector';
import { BudgetDataSourceConfig } from '@/lib/connectors/budget-data-source';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, spreadsheetId, sheetName } = body;

    if (!customerId || !spreadsheetId) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, spreadsheetId' },
        { status: 400 }
      );
    }

    // Get Google OAuth credentials for this customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { users: true }
    });

    if (!customer || !customer.users || customer.users.length === 0) {
      return NextResponse.json(
        { error: 'Customer not found or has no users' },
        { status: 404 }
      );
    }

    const googleAuth = await prisma.googleAuth.findFirst({
      where: { userId: { in: customer.users.map((u: any) => u.id) } }
    });

    if (!googleAuth) {
      return NextResponse.json(
        { error: 'Google Sheets not connected. Please authorize access first.' },
        { status: 401 }
      );
    }

    // Create temporary connector for schema discovery
    const config: BudgetDataSourceConfig = {
      type: 'google_sheets',
      customerId,
      enabled: true,
      credentials: {
        access_token: googleAuth.accessToken,
        refresh_token: googleAuth.refreshToken,
        scope: googleAuth.scope
      },
      sourceConfig: {
        spreadsheetId,
        sheetName: sheetName || 'Sheet1'
      }
    };

    const connector = new GoogleSheetsBudgetConnector(config);

    // Test connection first
    const testResult = await connector.testConnection();
    if (!testResult.success) {
      return NextResponse.json(
        { error: 'Failed to connect to Google Sheet', details: testResult.error },
        { status: 400 }
      );
    }

    // Discover schema and get AI suggestions
    const schema = await connector.discoverSchema();

    // Check for missing required fields
    const requiredFields = ['department', 'fiscalPeriod', 'budgetedAmount'];
    const mappedFields = Object.values(schema.suggestedMappings);
    const missingFields = requiredFields.filter(f => !mappedFields.includes(f));

    return NextResponse.json({
      success: true,
      spreadsheetId,
      sheetName: sheetName || 'Sheet1',
      columns: schema.columns,
      sampleData: schema.sampleData,
      suggestedMappings: schema.suggestedMappings,
      confidence: schema.confidence,
      missingFields,
      canProceed: missingFields.length === 0
    });
  } catch (error: any) {
    console.error('[Discover Schema] Error:', error);
    return NextResponse.json(
      { error: 'Failed to discover schema', details: error.message },
      { status: 500 }
    );
  }
}
