import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { validateMappedData, transformMappedData, ColumnMapping } from '@/lib/ai/mapping-engine';
import { prisma } from '@/lib/prisma';

/**
 * Import budget data from Excel file
 * POST /api/excel/import
 */
export async function POST(req: NextRequest) {
  try {
    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;
    const customerId = formData.get('customerId') as string;
    const mappingsJson = formData.get('mappings') as string;

    if (!file || !userId || !customerId || !mappingsJson) {
      return NextResponse.json(
        { error: 'file, userId, customerId, and mappings are required' },
        { status: 400 }
      );
    }

    // Parse mappings
    let mappings: Array<{ sourceColumn: string; targetField: string }>;
    try {
      mappings = JSON.parse(mappingsJson);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid mappings format' },
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

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.' },
        { status: 400 }
      );
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Parse Excel file
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Failed to parse Excel file' },
        { status: 400 }
      );
    }

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to array of arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'Excel file must contain at least one data row' },
        { status: 400 }
      );
    }

    // Prepare mappings with sample values for validation
    const fullMappings: ColumnMapping[] = mappings.map(m => {
      const colIndex = rows[0].indexOf(m.sourceColumn);
      const sampleValues = colIndex >= 0
        ? rows.slice(1, 4).map(row => row[colIndex]).filter(Boolean)
        : [];

      return {
        sourceColumn: m.sourceColumn,
        targetField: m.targetField,
        confidence: 1.0,
        reason: 'User confirmed',
        sampleValues,
      };
    });

    // Validate mapped data
    const validationResult = validateMappedData(rows, fullMappings);

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
    const budgets = transformMappedData(rows, fullMappings);

    if (budgets.length === 0) {
      return NextResponse.json(
        { error: 'No valid budget data found in file' },
        { status: 400 }
      );
    }

    // Create import history record
    const importHistory = await prisma.importHistory.create({
      data: {
        customerId,
        sourceType: 'excel',
        fileName: file.name,
        totalRows: budgets.length,
        importedById: userId,
        status: 'processing',
      },
    });

    let successCount = 0;
    let failureCount = 0;
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
                  source: 'excel',
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
                  actorId: userId,
                  action: 'budget_updated',
                  entityType: 'budget',
                  entityId: existing.id,
                  metadata: {
                    source: 'excel',
                    importHistoryId: importHistory.id,
                    fileName: file.name,
                    description: `Budget updated via Excel: ${budget.department} - ${budget.fiscalPeriod}`
                  },
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
                  source: 'excel',
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
                  actorId: userId,
                  action: 'budget_created',
                  entityType: 'budget',
                  entityId: newBudget.id,
                  metadata: {
                    source: 'excel',
                    importHistoryId: importHistory.id,
                    fileName: file.name,
                    description: `Budget created via Excel: ${budget.department} - ${budget.fiscalPeriod}`
                  },
                },
              });
            }

            successCount++;
          } catch (error: any) {
            failureCount++;
            errors.push({
              row: i + 2, // +2 because: +1 for header, +1 for 1-based indexing
              error: error.message,
            });

            // If too many errors, abort transaction
            if (failureCount > 10) {
              throw new Error('Too many errors during import. Transaction aborted.');
            }
          }
        }
      }, { timeout: 60000 }); // 60 second timeout for large imports

      // Update import history to completed
      await prisma.importHistory.update({
        where: { id: importHistory.id },
        data: {
          status: 'completed',
          successCount,
          failureCount,
          errors: errors as any,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        importId: importHistory.id,
        totalRows: budgets.length,
        successCount,
        failureCount,
        errors: errors.length > 0 ? errors : undefined,
        warnings: validationResult.warnings.length > 0 ? validationResult.warnings : undefined,
      });
    } catch (transactionError: any) {
      // Update import history to failed
      await prisma.importHistory.update({
        where: { id: importHistory.id },
        data: {
          status: 'failed',
          failureCount,
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
          failureCount,
          errors,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Excel Import] Error:', error);
    return NextResponse.json(
      { error: 'Failed to import from Excel file', details: error.message },
      { status: 500 }
    );
  }
}
