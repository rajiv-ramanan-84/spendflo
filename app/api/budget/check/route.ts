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
        success: true,
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
    const utilizationPercent = ((committed + reserved) / budget.budgetedAmount) * 100;

    // Check auto-approval eligibility
    const autoApprovalThreshold = getAutoApprovalThreshold(department);
    const canAutoApprove = isAvailable && requestAmount <= autoApprovalThreshold && utilizationPercent < 90;

    return NextResponse.json({
      success: true,
      available: isAvailable,
      budget: {
        id: budget.id,
        budgetedAmount: budget.budgetedAmount,
        committed,
        reserved,
        available: effectiveAvailable,
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
