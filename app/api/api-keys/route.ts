import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApiKey, hashApiKey } from '@/lib/api-keys/generator';

/**
 * List API Keys
 * GET /api/api-keys
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status') || 'all';

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const where: any = { customerId };
    if (status !== 'all') {
      where.status = status;
    }

    const apiKeys = await prisma.apiKey.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Don't expose the actual key value
    const safeKeys = apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      status: key.status,
      permissions: key.permissions,
      usageCount: key.usageCount,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      createdBy: key.createdBy,
    }));

    return NextResponse.json({
      success: true,
      apiKeys: safeKeys,
    });
  } catch (error: any) {
    console.error('[API Keys List] Error:', error);
    return NextResponse.json(
      { error: 'Failed to list API keys', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Create API Key
 * POST /api/api-keys
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, createdById, name, permissions, expiresInDays } = body;

    if (!customerId || !createdById || !name) {
      return NextResponse.json(
        { error: 'customerId, createdById, and name are required' },
        { status: 400 }
      );
    }

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json(
        { error: 'At least one permission is required' },
        { status: 400 }
      );
    }

    // Verify customer and user exist
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { id: createdById },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate API key
    const { key, prefix } = generateApiKey();
    const hashedKey = hashApiKey(key);

    // Calculate expiry date
    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Create API key
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key: hashedKey,
        keyPrefix: prefix,
        customerId,
        createdById,
        permissions,
        expiresAt,
        status: 'active',
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        customerId,
        actorId: createdById,
        action: 'api_key_created',
        entityType: 'api_key',
        entityId: apiKey.id,
        metadata: {
          name,
          permissions,
          expiresAt: expiresAt?.toISOString(),
        },
      },
    });

    // Return the plain key ONLY ONCE (it won't be shown again)
    return NextResponse.json({
      success: true,
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: key, // Plain key shown only once
        keyPrefix: apiKey.keyPrefix,
        status: apiKey.status,
        permissions: apiKey.permissions,
        usageCount: apiKey.usageCount,
        lastUsedAt: apiKey.lastUsedAt,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        createdBy: apiKey.createdBy,
      },
      warning: 'This is the only time you will see this key. Please copy it now.',
    });
  } catch (error: any) {
    console.error('[API Keys Create] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create API key', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Update API Key (revoke/activate)
 * PATCH /api/api-keys
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKeyId, status, permissions, name } = body;

    if (!apiKeyId) {
      return NextResponse.json({ error: 'apiKeyId is required' }, { status: 400 });
    }

    // Get current API key
    const currentKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!currentKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};

    if (status) {
      if (!['active', 'revoked', 'expired'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be active, revoked, or expired' },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (permissions) {
      if (!Array.isArray(permissions) || permissions.length === 0) {
        return NextResponse.json(
          { error: 'Permissions must be a non-empty array' },
          { status: 400 }
        );
      }
      updateData.permissions = permissions;
    }

    if (name) {
      updateData.name = name;
    }

    // Update API key
    const updatedKey = await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: updateData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        customerId: updatedKey.customerId,
        actorId: updatedKey.createdById,
        action: status === 'revoked' ? 'api_key_revoked' : 'api_key_updated',
        entityType: 'api_key',
        entityId: updatedKey.id,
        metadata: {
          status,
          permissions,
          name,
          description: status === 'revoked'
            ? `Revoked API key: ${updatedKey.name}`
            : `Updated API key: ${updatedKey.name}`
        },
      },
    });

    return NextResponse.json({
      success: true,
      apiKey: {
        id: updatedKey.id,
        name: updatedKey.name,
        keyPrefix: updatedKey.keyPrefix,
        status: updatedKey.status,
        permissions: updatedKey.permissions,
        usageCount: updatedKey.usageCount,
        lastUsedAt: updatedKey.lastUsedAt,
        expiresAt: updatedKey.expiresAt,
        createdAt: updatedKey.createdAt,
        createdBy: updatedKey.createdBy,
      },
    });
  } catch (error: any) {
    console.error('[API Keys Update] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update API key', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Delete API Key
 * DELETE /api/api-keys
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKeyId = searchParams.get('apiKeyId');

    if (!apiKeyId) {
      return NextResponse.json({ error: 'apiKeyId is required' }, { status: 400 });
    }

    // Get API key
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Delete API key
    await prisma.apiKey.delete({
      where: { id: apiKeyId },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        customerId: apiKey.customerId,
        actorId: apiKey.createdById,
        action: 'api_key_deleted',
        entityType: 'api_key',
        entityId: apiKey.id,
        metadata: {
          name: apiKey.name,
          description: `Deleted API key: ${apiKey.name}`
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error: any) {
    console.error('[API Keys Delete] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key', details: error.message },
      { status: 500 }
    );
  }
}
