import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth/getUserFromRequest';

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Extract user from session server-side, not from request body
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { budgetId, amount, requestId, reason } = body;

    if (!budgetId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: budgetId, amount' },
        { status: 400 }
      );
    }

    // Get budget with utilization
    const budget = await prisma.budget.findUnique({
      where: { id: budgetId },
      include: { utilization: true },
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

    if (available < amount) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient budget',
        available,
        requested: amount,
      });
    }

    // Reserve the budget (soft hold)
    const utilization = await prisma.budgetUtilization.upsert({
      where: { budgetId },
      update: {
        reservedAmount: reserved + amount,
      },
      create: {
        budgetId,
        committedAmount: 0,
        reservedAmount: amount,
      },
    });

    // Create audit log with authenticated user info
    await prisma.auditLog.create({
      data: {
        budgetId,
        action: 'RESERVE',
        oldValue: reserved.toString(),
        newValue: (reserved + amount).toString(),
        changedBy: `${user.name} (${user.email})`, // Use authenticated user
        reason: reason || `Reserved $${amount} for request ${requestId || 'unknown'}`,
      },
    });

    return NextResponse.json({
      success: true,
      reservationId: requestId,
      amount,
      newReserved: utilization.reservedAmount,
      newAvailable: budget.budgetedAmount - utilization.committedAmount - utilization.reservedAmount,
    });
  } catch (error: any) {
    console.error('[Budget Reserve] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reserve budget', details: error.message },
      { status: 500 }
    );
  }
}
