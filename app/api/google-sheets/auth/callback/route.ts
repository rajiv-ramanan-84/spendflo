import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth callback handler
 * GET /api/google-sheets/auth/callback?code=xxx&state=yyy
 *
 * This endpoint is called by Google after user grants permission.
 * It exchanges the authorization code for access/refresh tokens.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle user denial
    if (error) {
      console.log('[OAuth Callback] User denied access:', error);
      return NextResponse.redirect(
        new URL('/fpa/google-sheets?error=access_denied', req.url)
      );
    }

    if (!code || !state) {
      console.error('[OAuth Callback] Missing code or state');
      return NextResponse.redirect(
        new URL('/fpa/google-sheets?error=invalid_callback', req.url)
      );
    }

    // Exchange code for tokens by calling our POST endpoint
    const baseUrl = req.url.split('/api')[0];
    const response = await fetch(`${baseUrl}/api/google-sheets/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, state }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('[OAuth Callback] Token exchange failed:', result);
      return NextResponse.redirect(
        new URL('/fpa/google-sheets?error=token_exchange_failed', req.url)
      );
    }

    // Success! Redirect back to Google Sheets page
    console.log('[OAuth Callback] Successfully connected Google Sheets');
    return NextResponse.redirect(
      new URL('/fpa/google-sheets?success=true', req.url)
    );
  } catch (error: any) {
    console.error('[OAuth Callback] Error:', error);
    return NextResponse.redirect(
      new URL('/fpa/google-sheets?error=callback_error', req.url)
    );
  }
}
