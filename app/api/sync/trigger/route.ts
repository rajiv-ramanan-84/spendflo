/**
 * API: Trigger Manual Sync
 *
 * POST /api/sync/trigger
 *
 * Allows users to manually trigger a budget sync on-demand
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncScheduler } from '@/lib/sync/sync-scheduler';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing required field: customerId' },
        { status: 400 }
      );
    }

    console.log(`[API] Manual sync triggered for customer ${customerId}`);

    // Trigger sync
    await syncScheduler.triggerManualSync(customerId);

    return NextResponse.json({
      success: true,
      message: 'Sync triggered successfully',
      customerId
    });

  } catch (error: any) {
    console.error('[API] Manual sync failed:', error);
    return NextResponse.json(
      { error: 'Failed to trigger sync', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET - Get sync status
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      // Return all scheduled syncs
      const allJobs = syncScheduler.getAllJobs();
      return NextResponse.json({
        total: allJobs.length,
        jobs: allJobs
      });
    }

    // Return specific customer sync status
    const status = syncScheduler.getSyncStatus(customerId);

    return NextResponse.json(status);

  } catch (error: any) {
    console.error('[API] Get sync status failed:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status', details: error.message },
      { status: 500 }
    );
  }
}
