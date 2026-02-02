import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: budgetId } = await params;

    const budget = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: {
        utilization: true,
        customer: true,
      },
    });

    if (!budget) {
      return NextResponse.json(
        { error: 'Budget not found' },
        { status: 404 }
      );
    }

    const committed = budget.utilization?.committedAmount || 0;
    const reserved = budget.utilization?.reservedAmount || 0;
    const available = budget.budgetedAmount - committed - reserved;
    const utilizationPercent = ((committed + reserved) / budget.budgetedAmount) * 100;

    return NextResponse.json({
      id: budget.id,
      customer: budget.customer.name,
      department: budget.department,
      subCategory: budget.subCategory,
      fiscalPeriod: budget.fiscalPeriod,
      currency: budget.currency,
      totalBudget: budget.budgetedAmount,
      committed,
      reserved,
      available,
      utilizationPercent,
      status: utilizationPercent >= 90 ? 'critical' : utilizationPercent >= 80 ? 'high-risk' : utilizationPercent >= 70 ? 'warning' : 'healthy',
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    });
  } catch (error: any) {
    console.error('[Budget Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get budget status', details: error.message },
      { status: 500 }
    );
  }
}
