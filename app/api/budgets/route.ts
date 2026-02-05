/**
 * API: View Budgets
 *
 * GET /api/budgets?customerId=xxx
 *
 * Simple endpoint to view imported budgets
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const importId = searchParams.get('importId'); // NEW: Filter by specific import
    const source = searchParams.get('source'); // NEW: Filter by source

    // Build where clause based on filters
    // Make customerId optional - if not provided, return all budgets
    const whereClause: any = {
      deletedAt: null
    };

    if (customerId) {
      whereClause.customerId = customerId;
    }

    // If importId specified, only return budgets from that import
    if (importId) {
      // Get the import history record
      const importHistory = await prisma.importHistory.findUnique({
        where: { id: importId }
      });

      if (!importHistory) {
        return NextResponse.json(
          { error: 'Import not found' },
          { status: 404 }
        );
      }

      // Filter by creation time window (budgets created during this import)
      const importStartTime = importHistory.createdAt;
      const importEndTime = importHistory.completedAt || new Date();

      whereClause.createdAt = {
        gte: importStartTime,
        lte: importEndTime
      };

      whereClause.source = importHistory.sourceType;
    }

    // If source specified, filter by source
    if (source) {
      whereClause.source = source;
    }

    const budgets = await prisma.budget.findMany({
      where: whereClause,
      orderBy: [
        { department: 'asc' },
        { fiscalPeriod: 'asc' }
      ],
      select: {
        id: true,
        customerId: true,
        department: true,
        subCategory: true,
        fiscalPeriod: true,
        budgetedAmount: true,
        currency: true,
        source: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      success: true,
      count: budgets.length,
      budgets,
      filters: {
        customerId,
        importId: importId || null,
        source: source || null
      }
    });

  } catch (error: any) {
    console.error('[Budgets API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch budgets', details: error.message },
      { status: 500 }
    );
  }
}
