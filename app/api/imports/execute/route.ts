import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { prisma } from '@/lib/prisma';
import { validateMappedData, transformMappedData, ColumnMapping } from '@/lib/ai/mapping-engine';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Execute Budget Import with Confirmed Mappings
 * Takes file and confirmed mappings, validates, and imports data
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const mappingsJson = formData.get('mappings') as string;
    const customerId = formData.get('customerId') as string;
    const createdById = formData.get('createdById') as string;

    // Validation
    if (!file || !mappingsJson || !customerId || !createdById) {
      return NextResponse.json(
        { error: 'Missing required fields: file, mappings, customerId, createdById' },
        { status: 400 }
      );
    }

    const mappings: ColumnMapping[] = JSON.parse(mappingsJson);

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json(
        { error: 'Invalid mappings provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileExtension || '')) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: createdById },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Read and parse file
    const buffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);

    let rows: any[][] = [];

    if (fileExtension === 'csv') {
      const csvContent = fileBuffer.toString('utf-8');
      rows = parse(csvContent, {
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } else {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    }

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'File must contain at least one data row' },
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
        { error: 'No valid budget data found in file' },
        { status: 400 }
      );
    }

    // Create import history record
    const importHistory = await prisma.importHistory.create({
      data: {
        customerId,
        sourceType: fileExtension === 'csv' ? 'csv' : 'excel',
        fileName: file.name,
        totalRows: budgets.length,
        importedById: createdById,
        status: 'processing',
      },
    });

    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    // Import budgets with transaction
    try {
      // Use transaction for data consistency
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
                  actorId: createdById,
                  action: 'budget_updated',
                  entityType: 'budget',
                  entityId: existing.id,
                  metadata: {
                    source: 'import',
                    importHistoryId: importHistory.id,
                    description: `Budget updated via import: ${budget.department} - ${budget.fiscalPeriod}`
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
                  actorId: createdById,
                  action: 'budget_created',
                  entityType: 'budget',
                  entityId: newBudget.id,
                  metadata: {
                    source: 'import',
                    importHistoryId: importHistory.id,
                    description: `Budget created via import: ${budget.department} - ${budget.fiscalPeriod}`
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
    console.error('[Import Execute] Error:', error);
    return NextResponse.json(
      { error: 'Failed to execute import', details: error.message },
      { status: 500 }
    );
  }
}
