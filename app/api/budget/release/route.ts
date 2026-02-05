/**
 * Budget Release API
 *
 * POST /api/budget/release
 *
 * Release reserved budget when:
 * - Request is cancelled by requester
 * - Request is rejected by approver
 * - FP&A manually releases budget
 *
 * Authorization:
 * - FP&A role (can release any budget)
 * - Admin role (can release any budget)
 * - Original requester (can only cancel their own request)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth/getUserFromRequest';

export async function POST(req: NextRequest) {
  try {
    // Extract user from session (for authorization)
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      budgetId,
      amount,
      requestId,
      reason,
      action, // 'cancel', 'reject', or 'manual_release'
      originalRequesterId, // Required for cancel action (to verify ownership)
    } = body;

    // Validate required fields
    if (!budgetId || !amount || !requestId) {
      return NextResponse.json(
        { error: 'Missing required fields: budgetId, amount, requestId' },
        { status: 400 }
      );
    }

    if (!action || !['cancel', 'reject', 'manual_release'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: cancel, reject, or manual_release' },
        { status: 400 }
      );
    }

    // AUTHORIZATION CHECK
    const isFPARole = user.role === 'fpa_admin' || user.role === 'fpa_user';
    const isAdmin = user.role === 'super_admin' || user.role === 'admin';
    const isOriginalRequester = action === 'cancel' && user.id === originalRequesterId;

    // FP&A and Admins can do any release
    // Original requester can only cancel their own requests
    if (!isFPARole && !isAdmin && !isOriginalRequester) {
      return NextResponse.json(
        {
          error: 'Forbidden: Only FP&A users, admins, or the original requester can release budgets',
          details: {
            userRole: user.role,
            action,
            allowed: 'FP&A, Admin, or original requester for cancellation',
          },
        },
        { status: 403 }
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

    const reserved = budget.utilization?.reservedAmount || 0;

    // Validate amount
    if (amount > reserved) {
      return NextResponse.json({
        success: false,
        error: 'Release amount exceeds reserved amount',
        reserved,
        requested: amount,
      });
    }

    // Release the budget
    const utilization = await prisma.budgetUtilization.upsert({
      where: { budgetId },
      update: {
        reservedAmount: reserved - amount,
      },
      create: {
        budgetId,
        committedAmount: 0,
        reservedAmount: 0, // Already released
      },
    });

    // Create audit log
    const actionDescriptions = {
      cancel: 'Request cancelled by user',
      reject: 'Request rejected',
      manual_release: 'Manually released by FP&A',
    };

    await prisma.auditLog.create({
      data: {
        budgetId,
        action: 'RELEASE',
        oldValue: reserved.toString(),
        newValue: (reserved - amount).toString(),
        changedBy: `${user.name} (${user.email})`,
        reason: reason || actionDescriptions[action as keyof typeof actionDescriptions],
      },
    });

    console.log('[Budget Release] Released budget:', {
      budgetId,
      amount,
      requestId,
      action,
      releasedBy: user.email,
    });

    return NextResponse.json({
      success: true,
      requestId,
      budgetId,
      amountReleased: amount,
      newReserved: utilization.reservedAmount,
      newAvailable: budget.budgetedAmount - utilization.committedAmount - utilization.reservedAmount,
      releasedBy: {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: user.role,
      },
      action,
    });
  } catch (error: any) {
    console.error('[Budget Release] Error:', error);
    return NextResponse.json(
      { error: 'Failed to release budget', details: error.message },
      { status: 500 }
    );
  }
}
