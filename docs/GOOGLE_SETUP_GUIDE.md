# Google Sheets Setup Guide

## Quick Start (5 Minutes)

### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com/
2. Click **Select a project** → **New Project**
3. Enter project name: "SpendFlo Budget"
4. Click **Create**

### Step 2: Enable APIs

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Sheets API" → Click → **Enable**
3. Search for "Google Drive API" → Click → **Enable**

### Step 3: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Configure Consent Screen**
   - User Type: **External**
   - App name: "SpendFlo Budget"
   - User support email: your email
   - Developer contact: your email
   - Click **Save and Continue**
   - Scopes: Skip (click **Save and Continue**)
   - Test users: Add your email
   - Click **Save and Continue**

3. Go to **Credentials** → Click **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: "SpendFlo Budget Web Client"
   - Authorized redirect URIs:
     - Add: `http://localhost:3001/api/google-sheets/auth/callback`
     - (For production, add: `https://yourdomain.com/api/google-sheets/auth/callback`)
   - Click **Create**

4. **Copy your credentials**:
   - Client ID: `123456789-xxxxx.apps.googleusercontent.com`
   - Client Secret: `GOCSPX-xxxxx`

### Step 4: Update Environment Variables

Edit `.env.local`:

```env
GOOGLE_CLIENT_ID="123456789-xxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxx"
GOOGLE_REDIRECT_URI="http://localhost:3001/api/google-sheets/auth/callback"
ENABLE_GOOGLE_SHEETS="true"
```

### Step 5: Restart Dev Server

```bash
# Stop current dev server (Ctrl+C)
npm run dev
```

### Step 6: Test Connection

```bash
# Get auth URL (replace userId and customerId with actual IDs from your database)
curl "http://localhost:3001/api/google-sheets/auth?userId=YOUR_USER_ID&customerId=YOUR_CUSTOMER_ID"

# Response will contain authUrl - open it in your browser
```

## Production Setup

### Verify Domain

For production, you'll need to verify your domain:

1. Go to **OAuth consent screen**
2. Click **Add domain** under Authorized domains
3. Add your domain (e.g., `yourdomain.com`)
4. Follow verification instructions

### Production Redirect URI

Update redirect URI for production:

```env
GOOGLE_REDIRECT_URI="https://yourdomain.com/api/google-sheets/auth/callback"
```

Add this URI to **Authorized redirect URIs** in Google Cloud Console.

### Publish App

1. Go to **OAuth consent screen**
2. Click **Publish App**
3. Submit for verification (optional, but recommended)

## Security Best Practices

1. **Never commit credentials** to Git
2. **Use environment variables** for all secrets
3. **Rotate secrets regularly**
4. **Monitor OAuth usage** in Google Cloud Console
5. **Enable 2FA** on your Google Cloud account
6. **Use service accounts** for server-to-server (future enhancement)

## Troubleshooting

### "redirect_uri_mismatch"
- Redirect URI in code doesn't match Google Cloud Console
- Make sure URIs match exactly (including http/https, port, path)

### "access_denied"
- User declined permission
- App is in testing mode and user is not a test user

### "invalid_client"
- Client ID or Secret is incorrect
- Check environment variables

### "Token has been expired or revoked"
- User revoked access
- Refresh token expired
- Re-authenticate user

## Testing with Test Users

While app is in testing mode:

1. Only test users can authenticate
2. Add test users: **OAuth consent screen** → **Test users** → **Add users**
3. Tokens expire after 7 days in testing mode
4. Publish app to remove this limitation

## Monitoring

Track OAuth usage in Google Cloud Console:

1. Go to **APIs & Services** → **Dashboard**
2. View request counts, errors, latency
3. Set up alerts for unusual activity

## Cost

- Google Sheets API: **Free** (100 requests per 100 seconds per user)
- Google Drive API: **Free** (1,000 requests per 100 seconds per user)

For higher limits, contact Google Cloud support.
