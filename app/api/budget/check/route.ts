import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAutoApprovalThreshold } from '@/lib/approval/engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { customerId, department, subCategory, fiscalPeriod, amount, currency = 'USD' } = body;

    if (!department || !fiscalPeriod || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: department, fiscalPeriod, amount' },
        { status: 400 }
      );
    }

    // Auto-use default customer if not provided
    if (!customerId || customerId === 'default-customer') {
      const defaultCustomer = await prisma.customer.findFirst({
        orderBy: { createdAt: 'asc' },
      });
      if (defaultCustomer) {
        customerId = defaultCustomer.id;
      } else {
        return NextResponse.json(
          { error: 'No customer found. Please seed the database first or provide a valid customerId.' },
          { status: 400 }
        );
      }
    }

    // Find budget - smart matching logic
    console.log('[Budget Check] Searching for budget with:', {
      customerId,
      department,
      subCategory: subCategory || '(any)',
      fiscalPeriod,
    });

    let budgets;

    if (subCategory) {
      // If subCategory specified, find exact match
      budgets = await prisma.budget.findMany({
        where: {
          customerId,
          department,
          subCategory,
          fiscalPeriod,
        },
        include: {
          utilization: true,
        },
      });
    } else {
      // If no subCategory, find ALL budgets for this department/period
      budgets = await prisma.budget.findMany({
        where: {
          customerId,
          department,
          fiscalPeriod,
        },
        include: {
          utilization: true,
        },
      });
    }

    if (!budgets || budgets.length === 0) {
      // Debug: Show all budgets for this department
      const allDeptBudgets = await prisma.budget.findMany({
        where: {
          customerId,
          department,
        },
        select: {
          id: true,
          department: true,
          subCategory: true,
          fiscalPeriod: true,
          budgetedAmount: true,
        },
      });

      console.log('[Budget Check] No match found. Available budgets for this department:', allDeptBudgets);

      return NextResponse.json({
        success: true,
        available: false,
        reason: 'No budget found for this department/period',
        details: {
          searchedFor: {
            department,
            subCategory: subCategory || '(any)',
            fiscalPeriod,
          },
          availableBudgets: allDeptBudgets,
        },
      });
    }

    // Sum all matching budgets
    const totalBudgeted = budgets.reduce((sum, b) => sum + b.budgetedAmount, 0);
    const totalCommitted = budgets.reduce((sum, b) => sum + (b.utilization?.committedAmount || 0), 0);
    const totalReserved = budgets.reduce((sum, b) => sum + (b.utilization?.reservedAmount || 0), 0);
    const available = totalBudgeted - totalCommitted - totalReserved;

    console.log('[Budget Check] Budget(s) found:', {
      count: budgets.length,
      budgets: budgets.map(b => ({ id: b.id, subCategory: b.subCategory, amount: b.budgetedAmount })),
      totalBudgeted,
      totalCommitted,
      totalReserved,
      available,
    });

    // Use first budget for reference (for ID, etc.)
    const budget = budgets[0];

    // NEW: Check pending requests in last 48 hours
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pendingRequests = await prisma.request.findMany({
      where: {
        budgetId: budget.id,
        status: 'pending',
        createdAt: { gte: cutoffDate },
      },
    });

    const pendingAmount = pendingRequests.reduce((sum, r) => sum + r.amount, 0);
    const effectiveAvailable = available - pendingAmount;

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

    const isAvailable = effectiveAvailable >= requestAmount;
    const utilizationPercent = ((totalCommitted + totalReserved) / totalBudgeted) * 100;

    // Check auto-approval eligibility
    const autoApprovalThreshold = getAutoApprovalThreshold(department);
    const canAutoApprove = isAvailable && requestAmount <= autoApprovalThreshold && utilizationPercent < 90;

    return NextResponse.json({
      success: true,
      available: isAvailable,
      budget: {
        id: budget.id,
        budgetedAmount: totalBudgeted,
        committed: totalCommitted,
        reserved: totalReserved,
        available: effectiveAvailable,
        matchedBudgets: budgets.length,
        budgetBreakdown: budgets.map(b => ({
          id: b.id,
          subCategory: b.subCategory,
          amount: b.budgetedAmount,
        })),
      },
      requestedAmount: requestAmount,
      currency: budget.currency,
      pendingRequests: pendingRequests.length,
      pendingAmount,
      utilizationPercent,
      canAutoApprove,
      autoApprovalThreshold,
      reason: isAvailable
        ? canAutoApprove
          ? `Budget available. Will be auto-approved.`
          : `Budget available. Requires FP&A approval (${requestAmount > autoApprovalThreshold ? 'exceeds threshold' : 'budget critical'}).`
        : `Insufficient budget. Available: $${effectiveAvailable.toLocaleString()}, Requested: $${requestAmount.toLocaleString()}. Please contact FP&A team.`,
    });
  } catch (error: any) {
    console.error('[Budget Check] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check budget', details: error.message },
      { status: 500 }
    );
  }
}
