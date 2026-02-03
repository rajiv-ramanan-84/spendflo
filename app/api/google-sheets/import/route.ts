import { NextRequest, NextResponse } from 'next/server';
import { readSheetData, refreshAccessToken } from '@/lib/google-sheets/client';
import { validateMappedData, transformMappedData, ColumnMapping } from '@/lib/ai/mapping-engine';
import { prisma } from '@/lib/prisma';

/**
 * Import budget data from Google Sheet
 * POST /api/google-sheets/import
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, customerId, spreadsheetId, sheetName, mappings, spreadsheetName } = body;

    if (!userId || !customerId || !spreadsheetId || !sheetName || !mappings) {
      return NextResponse.json(
        { error: 'userId, customerId, spreadsheetId, sheetName, and mappings are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json(
        { error: 'Invalid mappings provided' },
        { status: 400 }
      );
    }

    // Verify user and customer
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Get Google auth for user
    let googleAuth = await prisma.googleAuth.findUnique({
      where: { userId },
    });

    if (!googleAuth) {
      return NextResponse.json(
        { error: 'Google Sheets not connected' },
        { status: 404 }
      );
    }

    // Get OAuth credentials from environment
    const credentials = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-sheets/auth/callback',
    };

    // Check if token is expired and refresh if needed
    const now = new Date();
    if (googleAuth.expiryDate <= now && googleAuth.refreshToken) {
      try {
        const newTokens = await refreshAccessToken(credentials, googleAuth.refreshToken);
        googleAuth = await prisma.googleAuth.update({
          where: { userId },
          data: {
            accessToken: newTokens.accessToken,
            expiryDate: new Date(newTokens.expiryDate),
            updatedAt: new Date(),
          },
        });
      } catch (error) {
        return NextResponse.json(
          { error: 'Failed to refresh access token. Please reconnect.', requiresReauth: true },
          { status: 401 }
        );
      }
    }

    // Read sheet data
    const rows = await readSheetData(
      credentials,
      {
        accessToken: googleAuth.accessToken,
        refreshToken: googleAuth.refreshToken,
        expiryDate: googleAuth.expiryDate.getTime(),
      },
      spreadsheetId,
      sheetName
    );

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'Sheet must contain at least one data row' },
        { status: 400 }
      );
    }

    // Validate mapped data
    const validationResult = validateMappedData(rows, mappings);

    if (!validationResult.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Data validation failed',
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        },
        { status: 400 }
      );
    }

    // Transform data to budget objects
    const budgets = transformMappedData(rows, mappings);

    if (budgets.length === 0) {
      return NextResponse.json(
        { error: 'No valid budget data found in sheet' },
        { status: 400 }
      );
    }

    // Create import history record
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    const importHistory = await prisma.importHistory.create({
      data: {
        customerId,
        sourceType: 'google_sheets',
        fileName: spreadsheetName || sheetName,
        sheetUrl,
        totalRows: budgets.length,
        importedById: userId,
        status: 'processing',
        mappings: mappings as any,
      },
    });

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    // Import budgets with transaction
    try {
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < budgets.length; i++) {
          const budget = budgets[i];

          try {
            // Check if budget already exists
            const existing = await tx.budget.findFirst({
              where: {
                customerId,
                department: budget.department,
                subCategory: budget.subCategory || null,
                fiscalPeriod: budget.fiscalPeriod,
              },
            });

            if (existing) {
              // Update existing budget
              await tx.budget.update({
                where: { id: existing.id },
                data: {
                  budgetedAmount: budget.budgetedAmount,
                  currency: budget.currency,
                  source: 'google_sheets',
                  updatedAt: new Date(),
                },
              });

              // Update or create utilization
              const existingUtilization = await tx.budgetUtilization.findUnique({
                where: { budgetId: existing.id },
              });

              if (!existingUtilization) {
                await tx.budgetUtilization.create({
                  data: {
                    budgetId: existing.id,
                    committedAmount: 0,
                    reservedAmount: 0,
                  },
                });
              }

              // Log activity
              await tx.activity.create({
                data: {
                  customerId,
                  userId,
                  action: 'budget_updated',
                  entityType: 'budget',
                  entityId: existing.id,
                  description: `Budget updated via Google Sheets: ${budget.department} - ${budget.fiscalPeriod}`,
                  metadata: { source: 'google_sheets', importHistoryId: importHistory.id, sheetUrl },
                },
              });
            } else {
              // Create new budget
              const newBudget = await tx.budget.create({
                data: {
                  customerId,
                  department: budget.department,
                  subCategory: budget.subCategory,
                  fiscalPeriod: budget.fiscalPeriod,
                  budgetedAmount: budget.budgetedAmount,
                  currency: budget.currency,
                  source: 'google_sheets',
                },
              });

              // Create utilization
              await tx.budgetUtilization.create({
                data: {
                  budgetId: newBudget.id,
                  committedAmount: 0,
                  reservedAmount: 0,
                },
              });

              // Log activity
              await tx.activity.create({
                data: {
                  customerId,
                  userId,
                  action: 'budget_created',
                  entityType: 'budget',
                  entityId: newBudget.id,
                  description: `Budget created via Google Sheets: ${budget.department} - ${budget.fiscalPeriod}`,
                  metadata: { source: 'google_sheets', importHistoryId: importHistory.id, sheetUrl },
                },
              });
            }

            successCount++;
          } catch (error: any) {
            errorCount++;
            errors.push({
              row: i + 2, // +2 because: +1 for header, +1 for 1-based indexing
              error: error.message,
            });

            // If too many errors, abort transaction
            if (errorCount > 10) {
              throw new Error('Too many errors during import. Transaction aborted.');
            }
          }
        }
      });

      // Update import history to completed
      await prisma.importHistory.update({
        where: { id: importHistory.id },
        data: {
          status: 'completed',
          successCount,
          errorCount,
          errors: errors as any,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        importId: importHistory.id,
        totalRows: budgets.length,
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors : undefined,
        warnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined,
      });
    } catch (transactionError: any) {
      // Update import history to failed
      await prisma.importHistory.update({
        where: { id: importHistory.id },
        data: {
          status: 'failed',
          errorCount,
          errors: [{ error: transactionError.message }] as any,
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Import failed',
          details: transactionError.message,
          successCount,
          errorCount,
          errors,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Google Sheets Import] Error:', error);

    // Handle specific Google API errors
    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        { error: 'Google authentication failed. Please reconnect.', requiresReauth: true },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to import from Google Sheet', details: error.message },
      { status: 500 }
    );
  }
}
