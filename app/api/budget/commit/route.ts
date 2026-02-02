import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { budgetId, amount, requestId, userId, reason, wasReserved = false } = body;

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

    // If this was previously reserved, release the reservation and commit
    const newReserved = wasReserved ? Math.max(0, reserved - amount) : reserved;
    const newCommitted = committed + amount;

    // Check if we have enough budget
    const totalUsed = newCommitted + newReserved;
    if (totalUsed > budget.budgetedAmount) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient budget',
        available: budget.budgetedAmount - committed - reserved,
        requested: amount,
      });
    }

    // Commit the budget (hard lock)
    const utilization = await prisma.budgetUtilization.upsert({
      where: { budgetId },
      update: {
        committedAmount: newCommitted,
        reservedAmount: newReserved,
      },
      create: {
        budgetId,
        committedAmount: amount,
        reservedAmount: 0,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        budgetId,
        action: 'COMMIT',
        oldValue: `committed:${committed},reserved:${reserved}`,
        newValue: `committed:${newCommitted},reserved:${newReserved}`,
        changedBy: userId || 'system',
        reason: reason || `Committed ${amount} for request ${requestId || 'unknown'}`,
      },
    });

    return NextResponse.json({
      success: true,
      commitmentId: requestId,
      amount,
      newCommitted: utilization.committedAmount,
      newReserved: utilization.reservedAmount,
      newAvailable: budget.budgetedAmount - utilization.committedAmount - utilization.reservedAmount,
    });
  } catch (error: any) {
    console.error('[Budget Commit] Error:', error);
    return NextResponse.json(
      { error: 'Failed to commit budget', details: error.message },
      { status: 500 }
    );
  }
}
