import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    // Get all budgets
    const allBudgets = await prisma.budget.findMany({
      include: {
        utilization: true,
        customer: true,
      },
      orderBy: [
        { department: 'asc' },
        { subCategory: 'asc' },
        { fiscalPeriod: 'asc' },
        { createdAt: 'asc' }, // Keep oldest ones
      ],
    });

    // Group by department/subCategory/fiscalPeriod
    const groups: Record<string, any[]> = {};

    for (const budget of allBudgets) {
      const key = `${budget.department}|${budget.subCategory || 'null'}|${budget.fiscalPeriod}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(budget);
    }

    const duplicates: any[] = [];
    const toDelete: string[] = [];

    // Find duplicates
    for (const [key, budgets] of Object.entries(groups)) {
      if (budgets.length > 1) {
        duplicates.push({
          key,
          count: budgets.length,
          budgets: budgets.map(b => ({
            id: b.id,
            customer: b.customer.name,
            budgetedAmount: b.budgetedAmount,
            committed: b.utilization?.committedAmount || 0,
            reserved: b.utilization?.reservedAmount || 0,
            createdAt: b.createdAt,
          })),
        });

        // Keep the one with utilization data (committed/reserved > 0)
        // Otherwise keep the oldest one
        const withUtilization = budgets.find(b =>
          (b.utilization?.committedAmount || 0) > 0 ||
          (b.utilization?.reservedAmount || 0) > 0
        );

        const toKeep = withUtilization || budgets[0];

        // Mark others for deletion
        budgets.forEach(b => {
          if (b.id !== toKeep.id) {
            toDelete.push(b.id);
          }
        });
      }
    }

    // Delete duplicates
    if (toDelete.length > 0) {
      // Delete utilization records first
      await prisma.budgetUtilization.deleteMany({
        where: { budgetId: { in: toDelete } },
      });

      // Delete audit logs
      await prisma.auditLog.deleteMany({
        where: { budgetId: { in: toDelete } },
      });

      // Delete budgets
      await prisma.budget.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    return NextResponse.json({
      success: true,
      duplicatesFound: duplicates.length,
      budgetsDeleted: toDelete.length,
      details: duplicates,
      message: `Cleaned up ${toDelete.length} duplicate budgets. Kept budgets with utilization data or oldest entries.`,
    });
  } catch (error: any) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup duplicates', details: error.message },
      { status: 500 }
    );
  }
}
