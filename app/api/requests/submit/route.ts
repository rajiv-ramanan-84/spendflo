import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluateRequest, processAutoApproval } from '@/lib/approval/engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customerId,
      supplier,
      description,
      amount,
      department,
      subCategory,
      fiscalPeriod,
      createdById,
    } = body;

    // Validation
    if (!customerId || !supplier || !description || !amount || !department || !fiscalPeriod || !createdById) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Find matching budget
    const budget = await prisma.budget.findFirst({
      where: {
        customerId,
        department,
        subCategory: subCategory || null,
        fiscalPeriod,
      },
    });

    if (!budget) {
      return NextResponse.json(
        {
          success: false,
          status: 'rejected',
          reason: 'No budget found for this department/category',
        },
        { status: 404 }
      );
    }

    // Create request (initially pending)
    const request = await prisma.request.create({
      data: {
        customerId,
        supplier,
        description,
        amount,
        budgetCategory: department,
        budgetId: budget.id,
        status: 'pending',
        createdById,
      },
    });

    // Evaluate for auto-approval
    const decision = await evaluateRequest({
      customerId,
      department,
      subCategory: subCategory || null,
      fiscalPeriod,
      amount,
      requesterId: createdById,
    });

    // Process based on decision
    if (decision.decision === 'auto_approved') {
      // Auto-approve and reserve budget
      const result = await processAutoApproval(request.id, budget.id, amount);

      if (result.success) {
        // Fetch updated request
        const updatedRequest = await prisma.request.findUnique({
          where: { id: request.id },
          include: {
            budget: true,
            createdBy: true,
          },
        });

        return NextResponse.json({
          success: true,
          request: updatedRequest,
          status: 'auto_approved',
          reason: decision.reason,
          budgetReserved: true,
          available: decision.available,
        });
      } else {
        // Auto-approval failed, keep as pending
        await prisma.request.update({
          where: { id: request.id },
          data: {
            status: 'pending',
            approvalReason: 'Auto-approval failed, awaiting manual review',
          },
        });

        return NextResponse.json({
          success: true,
          request,
          status: 'pending',
          reason: 'Auto-approval failed. Request submitted for manual review.',
        });
      }
    } else if (decision.decision === 'rejected') {
      // Reject immediately
      await prisma.request.update({
        where: { id: request.id },
        data: {
          status: 'rejected',
          rejectionReason: decision.reason,
        },
      });

      return NextResponse.json({
        success: false,
        request,
        status: 'rejected',
        reason: decision.reason,
        available: decision.available,
      });
    } else {
      // Pending - requires FP&A approval
      await prisma.request.update({
        where: { id: request.id },
        data: {
          status: 'pending',
          approvalReason: decision.reason,
        },
      });

      return NextResponse.json({
        success: true,
        request,
        status: 'pending',
        reason: decision.reason,
        requiresApproval: true,
        available: decision.available,
      });
    }
  } catch (error: any) {
    console.error('[Request Submit] Error:', error);
    return NextResponse.json(
      { error: 'Failed to submit request', details: error.message },
      { status: 500 }
    );
  }
}
