import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { IncomingForm } from 'formidable';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';

async function parseExcel(fileBuffer: Buffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  return data;
}

export async function POST(req: NextRequest) {
  try {
    // Convert Request to Node.js IncomingMessage-like object
    const formData = await req.formData();
    const file = formData.get('file') as File;
    let customerId = formData.get('customerId') as string;
    const userId = formData.get('userId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Auto-use existing customer or create default
    if (!customerId || customerId === 'default-customer') {
      // Try to find any existing customer first
      let existingCustomer = await prisma.customer.findFirst();

      if (!existingCustomer) {
        // Only create default if no customers exist
        existingCustomer = await prisma.customer.create({
          data: {
            name: 'Default Organization',
            domain: 'default.local',
          },
        });
      }

      customerId = existingCustomer.id;
      console.log('[Upload] Using customer:', existingCustomer.name, existingCustomer.id);
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse Excel
    const data = await parseExcel(buffer);

    // Expected columns: Department, SubCategory, FiscalPeriod, BudgetedAmount, Currency
    const budgets = data.map((row: any) => ({
      department: row.Department || row.department,
      subCategory: row.SubCategory || row.subCategory || row['Sub Category'] || null,
      fiscalPeriod: row.FiscalPeriod || row.fiscalPeriod || row['Fiscal Period'],
      budgetedAmount: parseFloat(row.BudgetedAmount || row.budgetedAmount || row['Budgeted Amount'] || 0),
      currency: row.Currency || row.currency || 'USD',
    }));

    const results = {
      success: [] as any[],
      errors: [] as any[],
    };

    // Import budgets
    for (const budgetData of budgets) {
      try {
        if (!budgetData.department || !budgetData.fiscalPeriod || !budgetData.budgetedAmount) {
          results.errors.push({
            data: budgetData,
            error: 'Missing required fields',
          });
          continue;
        }

        // Check if budget exists
        const existing = await prisma.budget.findFirst({
          where: {
            customerId,
            department: budgetData.department,
            subCategory: budgetData.subCategory,
            fiscalPeriod: budgetData.fiscalPeriod,
          },
          include: {
            utilization: true,
          },
        });

        if (existing) {
          // Update existing budget
          const oldAmount = existing.budgetedAmount;
          const committed = existing.utilization?.committedAmount || 0;
          const reserved = existing.utilization?.reservedAmount || 0;

          // Cannot reduce budget below committed + reserved
          if (budgetData.budgetedAmount < (committed + reserved)) {
            results.errors.push({
              data: budgetData,
              error: `Cannot reduce budget below committed + reserved (${committed + reserved})`,
            });
            continue;
          }

          const updated = await prisma.budget.update({
            where: { id: existing.id },
            data: {
              budgetedAmount: budgetData.budgetedAmount,
              currency: budgetData.currency,
            },
          });

          // Create audit log
          await prisma.auditLog.create({
            data: {
              budgetId: updated.id,
              action: 'UPDATE',
              oldValue: oldAmount.toString(),
              newValue: budgetData.budgetedAmount.toString(),
              changedBy: userId || 'excel-upload',
              reason: 'Excel bulk upload',
            },
          });

          results.success.push({
            action: 'updated',
            budget: updated,
          });
        } else {
          // Create new budget
          const created = await prisma.budget.create({
            data: {
              customerId,
              department: budgetData.department,
              subCategory: budgetData.subCategory,
              fiscalPeriod: budgetData.fiscalPeriod,
              budgetedAmount: budgetData.budgetedAmount,
              currency: budgetData.currency,
              source: 'excel',
            },
          });

          // Create utilization record
          await prisma.budgetUtilization.create({
            data: {
              budgetId: created.id,
              committedAmount: 0,
              reservedAmount: 0,
            },
          });

          // Create audit log
          await prisma.auditLog.create({
            data: {
              budgetId: created.id,
              action: 'CREATE',
              oldValue: null,
              newValue: budgetData.budgetedAmount.toString(),
              changedBy: userId || 'excel-upload',
              reason: 'Excel bulk upload',
            },
          });

          results.success.push({
            action: 'created',
            budget: created,
          });
        }
      } catch (error: any) {
        results.errors.push({
          data: budgetData,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.success.length,
      failed: results.errors.length,
      results,
    });
  } catch (error: any) {
    console.error('[Upload Budget] Error:', error);
    return NextResponse.json(
      { error: 'Failed to upload budget', details: error.message },
      { status: 500 }
    );
  }
}
