import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Get API Key Usage Statistics
 * GET /api/api-keys/usage
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKeyId = searchParams.get('apiKeyId');
    const customerId = searchParams.get('customerId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const days = parseInt(searchParams.get('days') || '30');

    if (!apiKeyId && !customerId) {
      return NextResponse.json(
        { error: 'Either apiKeyId or customerId is required' },
        { status: 400 }
      );
    }

    // Build where clause
    const where: any = {};
    if (apiKeyId) {
      where.apiKeyId = apiKeyId;
    }
    if (customerId) {
      where.customerId = customerId;
    }

    // Filter by date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    where.createdAt = { gte: startDate };

    // Get usage logs
    const usageLogs = await prisma.apiKeyUsageLog.findMany({
      where,
      include: {
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Calculate statistics
    const stats = {
      totalRequests: usageLogs.length,
      successfulRequests: usageLogs.filter((log) => log.status === 'success').length,
      failedRequests: usageLogs.filter((log) => log.status === 'failed').length,
      uniqueIpAddresses: new Set(usageLogs.map((log) => log.ipAddress)).size,
      uniqueEndpoints: new Set(usageLogs.map((log) => log.endpoint)).size,
    };

    // Group by date
    const byDate: Record<string, number> = {};
    usageLogs.forEach((log) => {
      const date = log.createdAt.toISOString().split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });

    // Group by endpoint
    const byEndpoint: Record<string, number> = {};
    usageLogs.forEach((log) => {
      byEndpoint[log.endpoint] = (byEndpoint[log.endpoint] || 0) + 1;
    });

    // Group by status
    const byStatus: Record<string, number> = {};
    usageLogs.forEach((log) => {
      byStatus[log.status] = (byStatus[log.status] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      stats,
      byDate,
      byEndpoint,
      byStatus,
      recentLogs: usageLogs.slice(0, 20).map((log) => ({
        id: log.id,
        apiKey: log.apiKey,
        endpoint: log.endpoint,
        method: log.method,
        status: log.status,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('[API Key Usage] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get API key usage', details: error.message },
      { status: 500 }
    );
  }
}
