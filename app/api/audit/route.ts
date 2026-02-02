import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        budget: {
          select: {
            department: true,
            subCategory: true,
            fiscalPeriod: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });

    return NextResponse.json(logs);
  } catch (error: any) {
    console.error('[Audit API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs', details: error.message },
      { status: 500 }
    );
  }
}
