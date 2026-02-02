import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Update budget
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { budgetedAmount, currency, userId } = body;

    // Get current budget
    const existing = await prisma.budget.findUnique({
      where: { id },
      include: { utilization: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    const committed = existing.utilization?.committedAmount || 0;
    const reserved = existing.utilization?.reservedAmount || 0;
    const minAmount = committed + reserved;

    // Validate amount
    if (budgetedAmount < minAmount) {
      return NextResponse.json(
        { error: `Cannot reduce budget below committed + reserved ($${minAmount})` },
        { status: 400 }
      );
    }

    // Update budget
    const updated = await prisma.budget.update({
      where: { id },
      data: {
        budgetedAmount,
        currency: currency || existing.currency,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        budgetId: id,
        action: 'UPDATE',
        oldValue: existing.budgetedAmount.toString(),
        newValue: budgetedAmount.toString(),
        changedBy: userId || 'fpa-user',
        reason: 'Manual update via dashboard',
      },
    });

    return NextResponse.json({ success: true, budget: updated });
  } catch (error: any) {
    console.error('[Budget Update] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update budget', details: error.message },
      { status: 500 }
    );
  }
}

// Delete budget
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    // Get current budget
    const existing = await prisma.budget.findUnique({
      where: { id },
      include: { utilization: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    const committed = existing.utilization?.committedAmount || 0;
    const reserved = existing.utilization?.reservedAmount || 0;

    // Cannot delete if has committed or reserved amounts
    if (committed > 0 || reserved > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete budget with active commitments or reservations',
          details: { committed, reserved }
        },
        { status: 400 }
      );
    }

    // Delete utilization first
    if (existing.utilization) {
      await prisma.budgetUtilization.delete({
        where: { budgetId: id },
      });
    }

    // Delete audit logs
    await prisma.auditLog.deleteMany({
      where: { budgetId: id },
    });

    // Delete budget
    await prisma.budget.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Budget Delete] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete budget', details: error.message },
      { status: 500 }
    );
  }
}
