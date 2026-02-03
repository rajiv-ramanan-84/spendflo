import { prisma } from '@/lib/prisma';
import { Budget, Request, BudgetUtilization } from '@prisma/client';

export interface ApprovalDecision {
  decision: 'auto_approved' | 'pending' | 'rejected';
  action?: 'reserve' | 'notify_fpa';
  reason: string;
  available?: number;
  pendingAmount?: number;
  thresholdExceeded?: boolean;
}

export interface ApprovalContext {
  customerId: string;
  department: string;
  subCategory?: string | null;
  fiscalPeriod: string;
  amount: number;
  requesterId: string;
}

/**
 * Auto-approval thresholds per department (configurable)
 */
const AUTO_APPROVAL_THRESHOLDS: Record<string, number> = {
  Engineering: 10000,
  Sales: 5000,
  Marketing: 7500,
  Finance: 3000,
  HR: 5000,
  default: 5000, // Default threshold for unlisted departments
};

/**
 * Evaluate a request for auto-approval
 */
export async function evaluateRequest(context: ApprovalContext): Promise<ApprovalDecision> {
  try {
    // Find matching budget
    const budget = await prisma.budget.findFirst({
      where: {
        customerId: context.customerId,
        department: context.department,
        subCategory: context.subCategory || null,
        fiscalPeriod: context.fiscalPeriod,
      },
      include: {
        utilization: true,
      },
    });

    if (!budget) {
      return {
        decision: 'rejected',
        reason: 'No budget found for this department/category',
      };
    }

    // Calculate available budget
    const committed = budget.utilization?.committedAmount || 0;
    const reserved = budget.utilization?.reservedAmount || 0;
    const available = budget.budgetedAmount - committed - reserved;

    // Check pending requests in last 48 hours
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

    // Rule 1: Check budget availability
    if (effectiveAvailable < context.amount) {
      return {
        decision: 'rejected',
        reason: `Insufficient budget. Available: $${effectiveAvailable.toLocaleString()}, Requested: $${context.amount.toLocaleString()}. Please contact FP&A team.`,
        available: effectiveAvailable,
        pendingAmount,
      };
    }

    // Rule 2: Check amount threshold
    const threshold = AUTO_APPROVAL_THRESHOLDS[context.department] || AUTO_APPROVAL_THRESHOLDS.default;
    if (context.amount > threshold) {
      return {
        decision: 'pending',
        action: 'notify_fpa',
        reason: `Amount exceeds auto-approval threshold of $${threshold.toLocaleString()}. Requires FP&A approval.`,
        available: effectiveAvailable,
        thresholdExceeded: true,
      };
    }

    // Rule 3: Check budget health (prevent auto-approval if critical)
    const utilization = ((committed + reserved) / budget.budgetedAmount) * 100;
    if (utilization >= 90) {
      return {
        decision: 'pending',
        action: 'notify_fpa',
        reason: `Budget is ${utilization.toFixed(0)}% utilized (critical). Requires FP&A review.`,
        available: effectiveAvailable,
      };
    }

    // Rule 4: Verify requester is active
    const requester = await prisma.user.findUnique({
      where: { id: context.requesterId },
    });

    if (!requester || !requester.isActive) {
      return {
        decision: 'rejected',
        reason: 'Requester account is inactive',
      };
    }

    // All checks passed - auto-approve!
    return {
      decision: 'auto_approved',
      action: 'reserve',
      reason: `Budget available. Auto-approved for $${context.amount.toLocaleString()}.`,
      available: effectiveAvailable,
    };
  } catch (error: any) {
    console.error('[Approval Engine] Error:', error);
    return {
      decision: 'pending',
      action: 'notify_fpa',
      reason: 'Error evaluating request. Manual review required.',
    };
  }
}

/**
 * Process auto-approval and reserve budget
 */
export async function processAutoApproval(
  requestId: string,
  budgetId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      // Update request status
      await tx.request.update({
        where: { id: requestId },
        data: {
          status: 'auto_approved',
          autoApproved: true,
          approvalReason: 'Automatically approved - budget available and criteria met',
        },
      });

      // Reserve budget
      await tx.budgetUtilization.upsert({
        where: { budgetId },
        create: {
          budgetId,
          reservedAmount: amount,
        },
        update: {
          reservedAmount: { increment: amount },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          budgetId,
          action: 'RESERVE',
          oldValue: '0',
          newValue: amount.toString(),
          changedBy: 'system',
          reason: `Auto-approved request ${requestId}`,
        },
      });
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Process Auto-Approval] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get auto-approval threshold for a department
 */
export function getAutoApprovalThreshold(department: string): number {
  return AUTO_APPROVAL_THRESHOLDS[department] || AUTO_APPROVAL_THRESHOLDS.default;
}

/**
 * Update auto-approval threshold for a department (admin only)
 */
export async function updateAutoApprovalThreshold(
  department: string,
  threshold: number
): Promise<void> {
  // In production, store this in database as configuration
  AUTO_APPROVAL_THRESHOLDS[department] = threshold;
}
