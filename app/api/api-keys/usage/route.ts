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
    where.timestamp = { gte: startDate };

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
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Calculate statistics
    const stats = {
      totalRequests: usageLogs.length,
      successfulRequests: usageLogs.filter((log) => log.statusCode >= 200 && log.statusCode < 300).length,
      failedRequests: usageLogs.filter((log) => log.statusCode >= 400).length,
      uniqueIpAddresses: new Set(usageLogs.map((log) => log.ipAddress).filter(Boolean)).size,
      uniqueEndpoints: new Set(usageLogs.map((log) => log.endpoint)).size,
    };

    // Group by date
    const byDate: Record<string, number> = {};
    usageLogs.forEach((log) => {
      const date = log.timestamp.toISOString().split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });

    // Group by endpoint
    const byEndpoint: Record<string, number> = {};
    usageLogs.forEach((log) => {
      byEndpoint[log.endpoint] = (byEndpoint[log.endpoint] || 0) + 1;
    });

    // Group by status code
    const byStatusCode: Record<string, number> = {};
    usageLogs.forEach((log) => {
      const code = log.statusCode.toString();
      byStatusCode[code] = (byStatusCode[code] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      stats,
      byDate,
      byEndpoint,
      byStatusCode,
      recentLogs: usageLogs.slice(0, 20).map((log) => ({
        id: log.id,
        apiKey: log.apiKey,
        endpoint: log.endpoint,
        method: log.method,
        statusCode: log.statusCode,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        timestamp: log.timestamp,
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
