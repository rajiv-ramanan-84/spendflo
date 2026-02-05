/**
 * API: Sync History
 *
 * GET /api/sync/history?customerId=xxx - Get sync history for customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing customerId parameter' },
        { status: 400 }
      );
    }

    // Get sync history
    const history = await prisma.syncHistory.findMany({
      where: { customerId },
      orderBy: { startTime: 'desc' },
      take: limit,
      skip: offset,
      include: {
        config: {
          select: {
            sourceType: true,
            frequency: true
          }
        }
      }
    });

    // Get total count
    const totalCount = await prisma.syncHistory.count({
      where: { customerId }
    });

    return NextResponse.json({
      customerId,
      total: totalCount,
      limit,
      offset,
      history: history.map(h => ({
        id: h.id,
        syncId: h.syncId,
        status: h.status,
        startTime: h.startTime,
        endTime: h.endTime,
        durationMs: h.durationMs,
        stats: {
          totalRows: h.totalRows,
          created: h.createdCount,
          updated: h.updatedCount,
          unchanged: h.unchangedCount,
          softDeleted: h.softDeletedCount,
          errors: h.errorCount
        },
        sourceType: h.config.sourceType,
        frequency: h.config.frequency,
        triggeredBy: h.triggeredBy,
        hasErrors: h.errorCount > 0,
        createdAt: h.createdAt
      }))
    });

  } catch (error: any) {
    console.error('[API] Get sync history failed:', error);
    return NextResponse.json(
      { error: 'Failed to get sync history', details: error.message },
      { status: 500 }
    );
  }
}
