import { NextRequest, NextResponse } from 'next/server';
import { listSpreadsheets, refreshAccessToken } from '@/lib/google-sheets/client';
import { prisma } from '@/lib/prisma';

/**
 * List user's Google Sheets
 * GET /api/google-sheets/list
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Get Google auth for user
    let googleAuth = await prisma.googleAuth.findUnique({
      where: { userId },
    });

    if (!googleAuth) {
      return NextResponse.json(
        { error: 'Google Sheets not connected. Please connect your Google account first.' },
        { status: 404 }
      );
    }

    // Get OAuth credentials from environment
    const credentials = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-sheets/auth/callback',
    };

    // Check if token is expired
    const now = new Date();
    if (googleAuth.expiryDate <= now) {
      // Try to refresh token
      if (googleAuth.refreshToken) {
        try {
          const newTokens = await refreshAccessToken(credentials, googleAuth.refreshToken);

          // Update tokens in database
          googleAuth = await prisma.googleAuth.update({
            where: { userId },
            data: {
              accessToken: newTokens.accessToken,
              expiryDate: new Date(newTokens.expiryDate),
              updatedAt: new Date(),
            },
          });
        } catch (error) {
          return NextResponse.json(
            {
              error: 'Failed to refresh access token. Please reconnect your Google account.',
              requiresReauth: true,
            },
            { status: 401 }
          );
        }
      } else {
        return NextResponse.json(
          {
            error: 'Access token expired and no refresh token available. Please reconnect your Google account.',
            requiresReauth: true,
          },
          { status: 401 }
        );
      }
    }

    // List spreadsheets
    const spreadsheets = await listSpreadsheets(credentials, {
      accessToken: googleAuth.accessToken,
      refreshToken: googleAuth.refreshToken,
      expiryDate: googleAuth.expiryDate.getTime(),
    });

    return NextResponse.json({
      success: true,
      spreadsheets: spreadsheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        modifiedTime: sheet.modifiedTime,
        createdTime: sheet.createdTime,
      })),
    });
  } catch (error: any) {
    console.error('[Google Sheets List] Error:', error);
    console.error('[Google Sheets List] Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      errors: error.errors,
      response: error.response?.data,
    });

    // Handle specific Google API errors
    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        {
          error: 'Google authentication failed. Please reconnect your Google account.',
          requiresReauth: true,
          details: error.message,
          googleError: error.errors || error.response?.data,
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to list Google Sheets',
        details: error.message,
        googleError: error.errors || error.response?.data,
      },
      { status: 500 }
    );
  }
}
