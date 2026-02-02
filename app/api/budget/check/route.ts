import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, department, subCategory, fiscalPeriod, amount, currency = 'USD' } = body;

    if (!customerId || !department || !fiscalPeriod || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, department, fiscalPeriod, amount' },
        { status: 400 }
      );
    }

    // Find budget
    const budget = await prisma.budget.findFirst({
      where: {
        customerId,
        department,
        subCategory: subCategory || null,
        fiscalPeriod,
      },
      include: {
        utilization: true,
      },
    });

    if (!budget) {
      return NextResponse.json({
        available: false,
        reason: 'No budget found for this department/category',
        details: {
          department,
          subCategory,
          fiscalPeriod,
        },
      });
    }

    // Calculate available amount
    const committed = budget.utilization?.committedAmount || 0;
    const reserved = budget.utilization?.reservedAmount || 0;
    const available = budget.budgetedAmount - committed - reserved;

    // Convert amount if currency mismatch (simple conversion)
    let requestAmount = amount;
    if (currency !== budget.currency) {
      // Simple conversion: GBP to USD ~1.27, USD to GBP ~0.79
      if (currency === 'GBP' && budget.currency === 'USD') {
        requestAmount = amount * 1.27;
      } else if (currency === 'USD' && budget.currency === 'GBP') {
        requestAmount = amount * 0.79;
      }
    }

    const isAvailable = available >= requestAmount;

    return NextResponse.json({
      isAvailable,
      budgetId: budget.id,
      requestedAmount: requestAmount,
      currency: budget.currency,
      totalBudget: budget.budgetedAmount,
      committed,
      reserved,
      available,
      utilizationPercent: ((committed + reserved) / budget.budgetedAmount) * 100,
      reason: isAvailable ? 'Budget available' : 'Insufficient budget',
    });
  } catch (error: any) {
    console.error('[Budget Check] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check budget', details: error.message },
      { status: 500 }
    );
  }
}
