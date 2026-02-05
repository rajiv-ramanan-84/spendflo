/**
 * API: Manage Sync Configuration
 *
 * POST /api/sync/config - Create or update sync configuration
 * GET /api/sync/config?customerId=xxx - Get sync configuration
 * DELETE /api/sync/config?customerId=xxx - Delete sync configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET - Get sync configuration
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing customerId parameter' },
        { status: 400 }
      );
    }

    const configs = await prisma.budgetDataSourceConfig.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      customerId,
      configs: configs.map(c => ({
        id: c.id,
        sourceType: c.sourceType,
        enabled: c.enabled,
        frequency: c.frequency,
        lastSyncAt: c.lastSyncAt,
        lastSyncStatus: c.lastSyncStatus,
        nextSyncAt: c.nextSyncAt,
        createdAt: c.createdAt
      }))
    });

  } catch (error: any) {
    console.error('[API] Get sync config failed:', error);
    return NextResponse.json(
      { error: 'Failed to get sync configuration', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Create or update sync configuration
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customerId,
      sourceType,
      enabled = true,
      frequency = 'every_4_hours',
      sourceConfig
    } = body;

    // Validate required fields
    if (!customerId || !sourceType || !sourceConfig) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, sourceType, sourceConfig' },
        { status: 400 }
      );
    }

    // Validate source type
    const validSourceTypes = ['sftp', 's3', 'google_sheets', 'anaplan', 'prophix', 'workday', 'file_drop'];
    if (!validSourceTypes.includes(sourceType)) {
      return NextResponse.json(
        { error: `Invalid sourceType. Must be one of: ${validSourceTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate frequency
    const validFrequencies = ['hourly', 'every_4_hours', 'every_12_hours', 'daily', 'manual'];
    if (!validFrequencies.includes(frequency)) {
      return NextResponse.json(
        { error: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if config already exists
    const existing = await prisma.budgetDataSourceConfig.findFirst({
      where: {
        customerId,
        sourceType
      }
    });

    let config;

    if (existing) {
      // Update existing config
      config = await prisma.budgetDataSourceConfig.update({
        where: { id: existing.id },
        data: {
          enabled,
          frequency,
          sourceConfig,
          updatedAt: new Date()
        }
      });

      console.log(`[API] Updated sync config for customer ${customerId} (${sourceType})`);

    } else {
      // Create new config
      config = await prisma.budgetDataSourceConfig.create({
        data: {
          customerId,
          sourceType,
          enabled,
          frequency,
          sourceConfig,
          syncEnabled: true
        }
      });

      console.log(`[API] Created sync config for customer ${customerId} (${sourceType})`);
    }

    return NextResponse.json({
      success: true,
      message: existing ? 'Configuration updated' : 'Configuration created',
      config: {
        id: config.id,
        customerId: config.customerId,
        sourceType: config.sourceType,
        enabled: config.enabled,
        frequency: config.frequency,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      }
    });

  } catch (error: any) {
    console.error('[API] Create/update sync config failed:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete sync configuration
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const configId = searchParams.get('configId');

    if (!customerId && !configId) {
      return NextResponse.json(
        { error: 'Missing customerId or configId parameter' },
        { status: 400 }
      );
    }

    if (configId) {
      // Delete specific config
      await prisma.budgetDataSourceConfig.delete({
        where: { id: configId }
      });

      console.log(`[API] Deleted sync config: ${configId}`);

    } else if (customerId) {
      // Delete all configs for customer
      const result = await prisma.budgetDataSourceConfig.deleteMany({
        where: { customerId }
      });

      console.log(`[API] Deleted ${result.count} sync configs for customer ${customerId}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Configuration deleted'
    });

  } catch (error: any) {
    console.error('[API] Delete sync config failed:', error);
    return NextResponse.json(
      { error: 'Failed to delete configuration', details: error.message },
      { status: 500 }
    );
  }
}
