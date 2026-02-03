import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * Google Sheets Client
 * Handles OAuth authentication and sheet operations
 */

// OAuth 2.0 configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Create OAuth2 client
 */
export function createOAuth2Client(credentials: GoogleCredentials): OAuth2Client {
  return new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    credentials.redirectUri
  );
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthUrl(credentials: GoogleCredentials, state?: string): string {
  const oauth2Client = createOAuth2Client(credentials);

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: state || '',
    prompt: 'consent', // Force consent to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(
  credentials: GoogleCredentials,
  code: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number;
}> {
  const oauth2Client = createOAuth2Client(credentials);

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('Failed to obtain access token');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
  };
}

/**
 * Create authenticated sheets client
 */
export function createSheetsClient(
  credentials: GoogleCredentials,
  tokens: {
    accessToken: string;
    refreshToken?: string | null;
    expiryDate?: number;
  }
) {
  const oauth2Client = createOAuth2Client(credentials);

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.expiryDate,
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

/**
 * List all spreadsheets accessible to the user
 */
export async function listSpreadsheets(
  credentials: GoogleCredentials,
  tokens: { accessToken: string; refreshToken?: string | null; expiryDate?: number }
) {
  const oauth2Client = createOAuth2Client(credentials);
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.expiryDate,
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name, modifiedTime, createdTime)',
    pageSize: 100,
    orderBy: 'modifiedTime desc',
  });

  return response.data.files || [];
}

/**
 * Get spreadsheet metadata
 */
export async function getSpreadsheetMetadata(
  credentials: GoogleCredentials,
  tokens: { accessToken: string; refreshToken?: string | null; expiryDate?: number },
  spreadsheetId: string
) {
  const sheets = createSheetsClient(credentials, tokens);

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties,sheets.properties',
  });

  return response.data;
}

/**
 * Read data from a specific sheet
 */
export async function readSheetData(
  credentials: GoogleCredentials,
  tokens: { accessToken: string; refreshToken?: string | null; expiryDate?: number },
  spreadsheetId: string,
  sheetName?: string,
  range?: string
): Promise<any[][]> {
  const sheets = createSheetsClient(credentials, tokens);

  // If no range specified, get all data from first sheet
  const readRange = range || (sheetName ? `${sheetName}!A1:ZZ` : 'A1:ZZ');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: readRange,
  });

  return response.data.values || [];
}

/**
 * Get sheet names from spreadsheet
 */
export async function getSheetNames(
  credentials: GoogleCredentials,
  tokens: { accessToken: string; refreshToken?: string | null; expiryDate?: number },
  spreadsheetId: string
): Promise<string[]> {
  const metadata = await getSpreadsheetMetadata(credentials, tokens, spreadsheetId);

  return (
    metadata.sheets?.map((sheet) => sheet.properties?.title || 'Untitled').filter(Boolean) || []
  );
}

/**
 * Validate tokens are still valid
 */
export async function validateTokens(
  credentials: GoogleCredentials,
  tokens: { accessToken: string; refreshToken?: string | null; expiryDate?: number }
): Promise<boolean> {
  try {
    const oauth2Client = createOAuth2Client(credentials);
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.expiryDate,
    });

    // Try to get token info to verify it's valid
    const tokenInfo = await oauth2Client.getTokenInfo(tokens.accessToken);
    return !!tokenInfo;
  } catch (error) {
    return false;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  credentials: GoogleCredentials,
  refreshToken: string
): Promise<{
  accessToken: string;
  expiryDate: number;
}> {
  const oauth2Client = createOAuth2Client(credentials);
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();

  if (!newCredentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  return {
    accessToken: newCredentials.access_token,
    expiryDate: newCredentials.expiry_date || Date.now() + 3600 * 1000,
  };
}
