import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAutoApprovalThreshold } from '@/lib/approval/engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let {
      customerId,
      department,
      subCategory,
      fiscalPeriod,
      amount,
      currency = 'USD',
      // NEW: Audit trail fields from orchestrator
      requestId,
      userId,
      userName,
      userEmail,
      vendor,
      purpose,
    } = body;

    if (!department || !fiscalPeriod || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: department, fiscalPeriod, amount' },
        { status: 400 }
      );
    }

    // Validate audit trail fields (recommended but not required for backward compatibility)
    if (!requestId || !userId) {
      console.warn('[Budget Check] Missing audit trail fields (requestId, userId). This is OK for testing but should be provided in production.');
    }

    // Auto-use default customer if not provided
    // For demo/testing, if no customerId, we'll check ALL customers
    const checkAllCustomers = !customerId || customerId === 'default-customer';

    if (!checkAllCustomers) {
      // Validate customerId exists
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });
      if (!customer) {
        return NextResponse.json(
          { error: 'Invalid customerId provided.' },
          { status: 400 }
        );
      }
    }

    // Find budget - smart matching logic
    console.log('[Budget Check] Searching for budget with:', {
      customerId: customerId || '(all customers)',
      department,
      subCategory: subCategory || '(any)',
      fiscalPeriod,
    });

    let budgets;
    const whereClause: any = {
      department,
      fiscalPeriod,
    };

    // Only filter by customerId if specific customer requested
    if (!checkAllCustomers) {
      whereClause.customerId = customerId;
    }

    // Add subCategory filter if specified
    if (subCategory) {
      whereClause.subCategory = subCategory;
    }

    budgets = await prisma.budget.findMany({
      where: whereClause,
      include: {
        utilization: true,
      },
    });

    if (!budgets || budgets.length === 0) {
      // Debug: Show all budgets for this department
      const debugWhere: any = { department };
      if (!checkAllCustomers) {
        debugWhere.customerId = customerId;
      }

      const allDeptBudgets = await prisma.budget.findMany({
        where: debugWhere,
        select: {
          id: true,
          customerId: true,
          department: true,
          subCategory: true,
          fiscalPeriod: true,
          budgetedAmount: true,
        },
      });

      console.log('[Budget Check] No match found. Available budgets for this department:', allDeptBudgets);

      const noBudgetResponse = {
        success: true,
        available: false,
        reason: 'No budget found for this department/period',
        details: {
          searchedFor: {
            department,
            subCategory: subCategory || '(any)',
            fiscalPeriod,
            customerId: customerId || '(all)',
          },
          availableBudgets: allDeptBudgets,
        },
      };

      // AUDIT LOG: Track failed budget checks too
      try {
        await prisma.budgetCheckLog.create({
          data: {
            requestId: requestId || `check_${Date.now()}`,
            userId: userId || 'unknown',
            userName: userName || 'Unknown User',
            userEmail: userEmail || 'unknown@example.com',
            customerId: customerId || 'unknown',
            department,
            subCategory: subCategory || null,
            fiscalPeriod,
            amount,
            currency,
            available: false,
            budgetId: null, // No budget found
            canAutoApprove: false,
            reason: noBudgetResponse.reason,
            response: noBudgetResponse,
            vendor: vendor || null,
            purpose: purpose || null,
          },
        });
      } catch (auditError: any) {
        console.error('[Budget Check] Failed to log audit trail:', auditError.message);
      }

      return NextResponse.json(noBudgetResponse);
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

    const responseData = {
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
    };

    // AUDIT LOG: Track every budget check for compliance
    try {
      await prisma.budgetCheckLog.create({
        data: {
          requestId: requestId || `check_${Date.now()}`, // Fallback for testing
          userId: userId || 'unknown',
          userName: userName || 'Unknown User',
          userEmail: userEmail || 'unknown@example.com',
          customerId: customerId || 'unknown',
          department,
          subCategory: subCategory || null,
          fiscalPeriod,
          amount: requestAmount,
          currency: budget.currency,
          available: isAvailable,
          budgetId: budget.id,
          canAutoApprove,
          reason: responseData.reason,
          response: responseData, // Store full response for debugging
          vendor: vendor || null,
          purpose: purpose || null,
        },
      });
      console.log('[Budget Check] Logged to audit trail:', { requestId, userId, available: isAvailable });
    } catch (auditError: any) {
      // Don't fail the request if audit logging fails
      console.error('[Budget Check] Failed to log audit trail:', auditError.message);
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('[Budget Check] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check budget', details: error.message },
      { status: 500 }
    );
  }
}
