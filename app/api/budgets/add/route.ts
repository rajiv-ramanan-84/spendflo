import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { department, subCategory, fiscalPeriod, budgetedAmount, currency = 'USD', userId } = body;

    if (!department || !fiscalPeriod || !budgetedAmount) {
      return NextResponse.json(
        { error: 'Missing required fields: department, fiscalPeriod, budgetedAmount' },
        { status: 400 }
      );
    }

    // Get or create customer
    let customer = await prisma.customer.findFirst();
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: 'Default Organization',
          domain: 'default.local',
        },
      });
    }

    // Check if budget already exists
    const existing = await prisma.budget.findFirst({
      where: {
        customerId: customer.id,
        department,
        subCategory: subCategory || null,
        fiscalPeriod,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Budget already exists for this department/category/period' },
        { status: 400 }
      );
    }

    // Create budget
    const budget = await prisma.budget.create({
      data: {
        customerId: customer.id,
        department,
        subCategory: subCategory || null,
        fiscalPeriod,
        budgetedAmount,
        currency,
        source: 'manual',
      },
    });

    // Create utilization record
    await prisma.budgetUtilization.create({
      data: {
        budgetId: budget.id,
        committedAmount: 0,
        reservedAmount: 0,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        budgetId: budget.id,
        action: 'CREATE',
        oldValue: null,
        newValue: budgetedAmount.toString(),
        changedBy: userId || 'fpa-user',
        reason: 'Manual creation via dashboard',
      },
    });

    return NextResponse.json({ success: true, budget });
  } catch (error: any) {
    console.error('[Budget Add] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add budget', details: error.message },
      { status: 500 }
    );
  }
}
