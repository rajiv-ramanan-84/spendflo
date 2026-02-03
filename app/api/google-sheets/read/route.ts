import { NextRequest, NextResponse } from 'next/server';
import { readSheetData, getSheetNames, refreshAccessToken } from '@/lib/google-sheets/client';
import { suggestMappings } from '@/lib/ai/mapping-engine';
import { prisma } from '@/lib/prisma';

/**
 * Read Google Sheet and apply AI mapping
 * POST /api/google-sheets/read
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, spreadsheetId, sheetName } = body;

    if (!userId || !spreadsheetId) {
      return NextResponse.json(
        { error: 'userId and spreadsheetId are required' },
        { status: 400 }
      );
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

    // Check if token is expired and refresh if needed
    const now = new Date();
    if (googleAuth.expiryDate <= now && googleAuth.refreshToken) {
      try {
        const newTokens = await refreshAccessToken(credentials, googleAuth.refreshToken);
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
          { error: 'Failed to refresh access token. Please reconnect your Google account.', requiresReauth: true },
          { status: 401 }
        );
      }
    }

    const tokens = {
      accessToken: googleAuth.accessToken,
      refreshToken: googleAuth.refreshToken,
      expiryDate: googleAuth.expiryDate.getTime(),
    };

    // Get available sheet names if no specific sheet requested
    let availableSheets: string[] = [];
    if (!sheetName) {
      availableSheets = await getSheetNames(credentials, tokens, spreadsheetId);

      return NextResponse.json({
        success: true,
        spreadsheetId,
        availableSheets,
        message: 'Please specify which sheet to read',
      });
    }

    // Read sheet data
    const rows = await readSheetData(credentials, tokens, spreadsheetId, sheetName);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Sheet is empty or has no data' },
        { status: 400 }
      );
    }

    // Extract headers and sample rows
    const headers = rows[0];
    const sampleRows = rows.slice(1, Math.min(6, rows.length)); // Get up to 5 sample rows
    const totalRows = rows.length - 1; // Exclude header row

    // Validate headers
    if (!headers || headers.length === 0) {
      return NextResponse.json(
        { error: 'No headers found in sheet' },
        { status: 400 }
      );
    }

    // Clean headers (remove empty/null values)
    const cleanedHeaders = headers.filter(h => h && String(h).trim());

    if (cleanedHeaders.length === 0) {
      return NextResponse.json(
        { error: 'No valid headers found in sheet' },
        { status: 400 }
      );
    }

    // Use AI mapping engine to suggest mappings
    const mappingResult = suggestMappings(cleanedHeaders, sampleRows);

    return NextResponse.json({
      success: true,
      spreadsheetId,
      sheetName,
      totalRows,
      totalColumns: cleanedHeaders.length,
      mappings: mappingResult.mappings,
      unmappedColumns: mappingResult.unmappedColumns,
      requiredFieldsMissing: mappingResult.requiredFieldsMissing,
      suggestions: mappingResult.suggestions,
      canProceed: mappingResult.requiredFieldsMissing.length === 0,
    });
  } catch (error: any) {
    console.error('[Google Sheets Read] Error:', error);

    // Handle specific Google API errors
    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        { error: 'Google authentication failed. Please reconnect your Google account.', requiresReauth: true },
        { status: 401 }
      );
    }

    if (error.message?.includes('Unable to parse range')) {
      return NextResponse.json(
        { error: 'Sheet not found. Please check the sheet name and try again.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to read Google Sheet', details: error.message },
      { status: 500 }
    );
  }
}
