import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { budgetId, amount, type = 'reserved', requestId, userId, reason } = body;

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

    let newCommitted = committed;
    let newReserved = reserved;

    // Release from committed or reserved
    if (type === 'committed') {
      newCommitted = Math.max(0, committed - amount);
    } else {
      newReserved = Math.max(0, reserved - amount);
    }

    // Update utilization
    const utilization = await prisma.budgetUtilization.upsert({
      where: { budgetId },
      update: {
        committedAmount: newCommitted,
        reservedAmount: newReserved,
      },
      create: {
        budgetId,
        committedAmount: 0,
        reservedAmount: 0,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        budgetId,
        action: 'RELEASE',
        oldValue: `${type}:${type === 'committed' ? committed : reserved}`,
        newValue: `${type}:${type === 'committed' ? newCommitted : newReserved}`,
        changedBy: userId || 'system',
        reason: reason || `Released ${amount} from ${type} for request ${requestId || 'unknown'}`,
      },
    });

    return NextResponse.json({
      success: true,
      releaseId: requestId,
      amount,
      type,
      newCommitted: utilization.committedAmount,
      newReserved: utilization.reservedAmount,
      newAvailable: budget.budgetedAmount - utilization.committedAmount - utilization.reservedAmount,
    });
  } catch (error: any) {
    console.error('[Budget Release] Error:', error);
    return NextResponse.json(
      { error: 'Failed to release budget', details: error.message },
      { status: 500 }
    );
  }
}
