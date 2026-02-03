import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Get Import History
 * Returns list of all import operations for a customer
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!customerId) {
      return NextResponse.json(
        { error: 'customerId is required' },
        { status: 400 }
      );
    }

    // Get import history with related user data
    const imports = await prisma.importHistory.findMany({
      where: { customerId },
      include: {
        importedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total count
    const total = await prisma.importHistory.count({
      where: { customerId },
    });

    return NextResponse.json({
      success: true,
      imports,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });

  } catch (error: any) {
    console.error('[Import History] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch import history', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Get Single Import Details
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { importId, customerId } = body;

    if (!importId || !customerId) {
      return NextResponse.json(
        { error: 'importId and customerId are required' },
        { status: 400 }
      );
    }

    const importRecord = await prisma.importHistory.findFirst({
      where: {
        id: importId,
        customerId,
      },
      include: {
        importedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!importRecord) {
      return NextResponse.json(
        { error: 'Import not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      import: importRecord,
    });

  } catch (error: any) {
    console.error('[Import Details] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch import details', details: error.message },
      { status: 500 }
    );
  }
}
