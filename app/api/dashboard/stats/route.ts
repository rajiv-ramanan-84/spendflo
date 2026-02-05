import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');
    const importId = searchParams.get('importId');
    const source = searchParams.get('source');

    const whereClause: any = customerId ? { customerId } : {};

    // If importId specified, filter by import time window
    if (importId) {
      const importHistory = await prisma.importHistory.findUnique({
        where: { id: importId }
      });

      if (importHistory) {
        const importStartTime = importHistory.createdAt;
        const importEndTime = importHistory.completedAt || new Date();

        whereClause.createdAt = {
          gte: importStartTime,
          lte: importEndTime
        };

        whereClause.source = importHistory.sourceType;
      }
    }

    // If source specified, filter by source
    if (source) {
      whereClause.source = source;
    }

    const budgets = await prisma.budget.findMany({
      where: whereClause,
      include: {
        utilization: true,
      },
    });

    const totalBudget = budgets.reduce((sum, b) => sum + b.budgetedAmount, 0);
    const totalCommitted = budgets.reduce((sum, b) => sum + (b.utilization?.committedAmount || 0), 0);
    const totalReserved = budgets.reduce((sum, b) => sum + (b.utilization?.reservedAmount || 0), 0);
    const totalAvailable = totalBudget - totalCommitted - totalReserved;

    // Calculate health status
    const healthyBudgets = budgets.filter(b => {
      const util = b.utilization;
      if (!util) return true;
      const pct = ((util.committedAmount + util.reservedAmount) / b.budgetedAmount) * 100;
      return pct < 70;
    });

    const warningBudgets = budgets.filter(b => {
      const util = b.utilization;
      if (!util) return false;
      const pct = ((util.committedAmount + util.reservedAmount) / b.budgetedAmount) * 100;
      return pct >= 70 && pct < 80;
    });

    const highRiskBudgets = budgets.filter(b => {
      const util = b.utilization;
      if (!util) return false;
      const pct = ((util.committedAmount + util.reservedAmount) / b.budgetedAmount) * 100;
      return pct >= 80 && pct < 90;
    });

    const criticalBudgets = budgets.filter(b => {
      const util = b.utilization;
      if (!util) return false;
      const pct = ((util.committedAmount + util.reservedAmount) / b.budgetedAmount) * 100;
      return pct >= 90;
    }).map(b => ({
      id: b.id,
      department: b.department,
      subCategory: b.subCategory,
      totalBudget: b.budgetedAmount,
      utilized: (b.utilization?.committedAmount || 0) + (b.utilization?.reservedAmount || 0),
      available: b.budgetedAmount - (b.utilization?.committedAmount || 0) - (b.utilization?.reservedAmount || 0),
      utilizationPercent: ((b.utilization?.committedAmount || 0) + (b.utilization?.reservedAmount || 0)) / b.budgetedAmount * 100,
    }));

    return NextResponse.json({
      summary: {
        totalBudget,
        totalCommitted,
        totalReserved,
        totalAvailable,
        totalUtilizationPercent: (totalBudget > 0 ? ((totalCommitted + totalReserved) / totalBudget) * 100 : 0),
      },
      health: {
        healthy: healthyBudgets.length,
        warning: warningBudgets.length,
        highRisk: highRiskBudgets.length,
        critical: criticalBudgets.length,
      },
      criticalBudgets,
      totalBudgets: budgets.length,
    });
  } catch (error: any) {
    console.error('[Dashboard Stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get dashboard stats', details: error.message },
      { status: 500 }
    );
  }
}
