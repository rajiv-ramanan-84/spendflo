import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl, getTokensFromCode } from '@/lib/google-sheets/client';
import { prisma } from '@/lib/prisma';

/**
 * Initiate Google OAuth flow
 * GET /api/google-sheets/auth
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const customerId = searchParams.get('customerId');

    if (!userId || !customerId) {
      return NextResponse.json(
        { error: 'userId and customerId are required' },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get OAuth credentials from environment
    const credentials = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-sheets/auth/callback',
    };

    if (!credentials.clientId || !credentials.clientSecret) {
      return NextResponse.json(
        { error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
        { status: 500 }
      );
    }

    // Generate state parameter to prevent CSRF
    const state = JSON.stringify({ userId, customerId });

    // Get authorization URL
    const authUrl = getAuthUrl(credentials, state);

    return NextResponse.json({
      success: true,
      authUrl,
    });
  } catch (error: any) {
    console.error('[Google Sheets Auth] Error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Google authentication', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle OAuth callback and exchange code for tokens
 * POST /api/google-sheets/auth
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }

    // Parse state to get userId and customerId
    let userId: string;
    let customerId: string;

    try {
      const stateData = JSON.parse(state || '{}');
      userId = stateData.userId;
      customerId = stateData.customerId;

      if (!userId || !customerId) {
        throw new Error('Invalid state parameter');
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get OAuth credentials from environment
    const credentials = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-sheets/auth/callback',
    };

    // Exchange code for tokens
    const tokens = await getTokensFromCode(credentials, code);

    // Store tokens in database
    const googleAuth = await prisma.googleAuth.upsert({
      where: { userId },
      create: {
        userId,
        customerId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiryDate: new Date(tokens.expiryDate),
        scope: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || undefined,
        expiryDate: new Date(tokens.expiryDate),
        updatedAt: new Date(),
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        customerId,
        userId,
        action: 'google_auth_connected',
        entityType: 'google_auth',
        entityId: googleAuth.id,
        description: 'Connected Google Sheets account',
        metadata: { scope: googleAuth.scope },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Google Sheets connected successfully',
      authId: googleAuth.id,
    });
  } catch (error: any) {
    console.error('[Google Sheets Auth Callback] Error:', error);
    return NextResponse.json(
      { error: 'Failed to complete Google authentication', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Disconnect Google Sheets
 * DELETE /api/google-sheets/auth
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Delete Google auth
    const deleted = await prisma.googleAuth.delete({
      where: { userId },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        customerId: deleted.customerId,
        userId: deleted.userId,
        action: 'google_auth_disconnected',
        entityType: 'google_auth',
        entityId: deleted.id,
        description: 'Disconnected Google Sheets account',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Google Sheets disconnected successfully',
    });
  } catch (error: any) {
    console.error('[Google Sheets Disconnect] Error:', error);

    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Google Sheets not connected' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to disconnect Google Sheets', details: error.message },
      { status: 500 }
    );
  }
}
