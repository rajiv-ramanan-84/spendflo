# Google Sheets Integration

## Overview

The Google Sheets integration allows users to import budget data directly from their Google Spreadsheets. It uses OAuth 2.0 for secure authentication and the AI-powered mapping engine for intelligent column detection.

## Features

- **OAuth 2.0 Authentication**: Secure Google account connection
- **Automatic Token Refresh**: Seamless re-authentication using refresh tokens
- **AI-Powered Mapping**: Intelligent column detection (same engine as CSV import)
- **Real-time Sheet Access**: Read data directly from Google Sheets
- **Multiple Sheet Support**: Choose which sheet to import from multi-sheet spreadsheets
- **Audit Logging**: Track all imports and account connections

## Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API and Google Drive API

### 2. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Add authorized redirect URI:
   - Development: `http://localhost:3001/api/google-sheets/auth/callback`
   - Production: `https://yourdomain.com/api/google-sheets/auth/callback`
5. Save the **Client ID** and **Client Secret**

### 3. Configure Environment Variables

Update `.env.local` with your Google OAuth credentials:

```env
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3001/api/google-sheets/auth/callback"
ENABLE_GOOGLE_SHEETS="true"
```

## API Endpoints

### 1. Initiate OAuth Flow

**Endpoint**: `GET /api/google-sheets/auth?userId={userId}&customerId={customerId}`

Generates a Google OAuth authorization URL.

**Request**:
```bash
curl "http://localhost:3001/api/google-sheets/auth?userId=user_123&customerId=cust_123"
```

**Response**:
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

**Usage**:
1. Redirect user to `authUrl`
2. User grants permission
3. Google redirects to callback URL with authorization code

### 2. Complete OAuth (Exchange Code for Tokens)

**Endpoint**: `POST /api/google-sheets/auth`

Exchanges authorization code for access/refresh tokens.

**Request**:
```bash
curl -X POST http://localhost:3001/api/google-sheets/auth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "authorization-code-from-google",
    "state": "{\"userId\":\"user_123\",\"customerId\":\"cust_123\"}"
  }'
```

**Response**:
```json
{
  "success": true,
  "message": "Google Sheets connected successfully",
  "authId": "auth_123"
}
```

### 3. List Google Sheets

**Endpoint**: `GET /api/google-sheets/list?userId={userId}`

Lists all Google Sheets accessible to the user.

**Request**:
```bash
curl "http://localhost:3001/api/google-sheets/list?userId=user_123"
```

**Response**:
```json
{
  "success": true,
  "spreadsheets": [
    {
      "id": "1abc123...",
      "name": "Budget 2025",
      "modifiedTime": "2025-01-15T10:30:00Z",
      "createdTime": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**Error Response** (Not Connected):
```json
{
  "error": "Google Sheets not connected. Please connect your Google account first.",
  "status": 404
}
```

**Error Response** (Token Expired):
```json
{
  "error": "Access token expired. Please reconnect your Google account.",
  "requiresReauth": true,
  "status": 401
}
```

### 4. Read Sheet Data (with AI Mapping)

**Endpoint**: `POST /api/google-sheets/read`

Reads sheet data and applies AI-powered column mapping.

**Step 1: Get Available Sheets**
```bash
curl -X POST http://localhost:3001/api/google-sheets/read \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "spreadsheetId": "1abc123..."
  }'
```

**Response**:
```json
{
  "success": true,
  "spreadsheetId": "1abc123...",
  "availableSheets": ["Sheet1", "Budget Q1", "Budget Q2"],
  "message": "Please specify which sheet to read"
}
```

**Step 2: Read Specific Sheet**
```bash
curl -X POST http://localhost:3001/api/google-sheets/read \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "spreadsheetId": "1abc123...",
    "sheetName": "Budget Q1"
  }'
```

**Response**:
```json
{
  "success": true,
  "spreadsheetId": "1abc123...",
  "sheetName": "Budget Q1",
  "totalRows": 50,
  "totalColumns": 5,
  "mappings": [
    {
      "sourceColumn": "Department",
      "targetField": "department",
      "confidence": 1.0,
      "reason": "Header \"Department\" matches pattern \"department\"",
      "sampleValues": ["Engineering", "Sales", "Marketing"]
    }
  ],
  "unmappedColumns": [],
  "requiredFieldsMissing": [],
  "suggestions": [],
  "canProceed": true
}
```

### 5. Import from Google Sheet

**Endpoint**: `POST /api/google-sheets/import`

Imports budget data from Google Sheet with confirmed mappings.

**Request**:
```bash
curl -X POST http://localhost:3001/api/google-sheets/import \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "customerId": "cust_123",
    "spreadsheetId": "1abc123...",
    "sheetName": "Budget Q1",
    "spreadsheetName": "Budget 2025",
    "mappings": [
      {"sourceColumn": "Department", "targetField": "department"},
      {"sourceColumn": "Amount", "targetField": "budgetedAmount"},
      {"sourceColumn": "Period", "targetField": "fiscalPeriod"}
    ]
  }'
```

**Response**:
```json
{
  "success": true,
  "importId": "import_123",
  "totalRows": 50,
  "successCount": 48,
  "errorCount": 2,
  "errors": [
    {
      "row": 15,
      "error": "Budget amount must be a positive number"
    }
  ],
  "warnings": []
}
```

### 6. Disconnect Google Sheets

**Endpoint**: `DELETE /api/google-sheets/auth?userId={userId}`

Disconnects user's Google account and deletes stored tokens.

**Request**:
```bash
curl -X DELETE "http://localhost:3001/api/google-sheets/auth?userId=user_123"
```

**Response**:
```json
{
  "success": true,
  "message": "Google Sheets disconnected successfully"
}
```

## Integration Flow

### Complete Import Flow

```
1. User clicks "Connect Google Sheets"
   ↓
2. Frontend calls GET /api/google-sheets/auth
   ↓
3. User redirected to Google OAuth consent screen
   ↓
4. User grants permission
   ↓
5. Google redirects to callback URL with code
   ↓
6. Frontend calls POST /api/google-sheets/auth with code
   ↓
7. Backend stores tokens in database
   ↓
8. User sees "Google Sheets Connected" ✓
   ↓
9. User clicks "Import from Google Sheets"
   ↓
10. Frontend calls GET /api/google-sheets/list
    ↓
11. User selects a spreadsheet
    ↓
12. Frontend calls POST /api/google-sheets/read (without sheetName)
    ↓
13. User selects a sheet from available sheets
    ↓
14. Frontend calls POST /api/google-sheets/read (with sheetName)
    ↓
15. AI mapping engine suggests column mappings
    ↓
16. User reviews and confirms mappings
    ↓
17. Frontend calls POST /api/google-sheets/import
    ↓
18. Budgets imported into database
    ↓
19. User sees import summary with success/error counts
```

## Token Management

### Access Token Lifecycle

1. **Initial Authorization**: User grants permission, backend receives access token + refresh token
2. **Token Storage**: Tokens encrypted and stored in `GoogleAuth` table
3. **Token Expiry**: Access tokens expire after ~1 hour
4. **Auto-Refresh**: When access token expires, system automatically uses refresh token to get new access token
5. **Refresh Failure**: If refresh fails, user must re-authenticate

### Token Refresh Logic

All endpoints automatically check token expiry and refresh if needed:

```typescript
if (googleAuth.expiryDate <= now && googleAuth.refreshToken) {
  const newTokens = await refreshAccessToken(credentials, googleAuth.refreshToken);
  googleAuth = await prisma.googleAuth.update({
    where: { userId },
    data: {
      accessToken: newTokens.accessToken,
      expiryDate: new Date(newTokens.expiryDate),
    },
  });
}
```

## Error Handling

### Common Errors

| Error | Status | Solution |
|-------|--------|----------|
| Google Sheets not connected | 404 | Call auth endpoint to connect |
| Access token expired | 401 | Auto-refreshed or requires reauth |
| Sheet not found | 404 | Check sheet name spelling |
| Invalid mappings | 400 | Review mapping configuration |
| Validation errors | 400 | Fix data in Google Sheet |
| Transaction aborted | 500 | Too many errors (>10), check data quality |

### Reauth Required

When `requiresReauth: true` is returned:
1. Show user a message to reconnect
2. Call auth endpoint again
3. User goes through OAuth flow again

## Security

### OAuth Scopes

Only requests read-only access:
- `https://www.googleapis.com/auth/spreadsheets.readonly`

### Token Storage

- Access tokens stored encrypted in database
- Refresh tokens stored encrypted in database
- Tokens tied to specific user and customer
- Tokens automatically deleted when user disconnects

### Data Access

- Users can only import to their own customer account
- Permission checks on every API call
- Audit logging for all operations

## Database Schema

```prisma
model GoogleAuth {
  id           String    @id @default(cuid())
  userId       String    @unique
  customerId   String
  accessToken  String    @db.Text
  refreshToken String?   @db.Text
  expiryDate   DateTime
  scope        String[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @default(now()) @updatedAt

  user         User      @relation(fields: [userId], references: [id])
  customer     Customer  @relation(fields: [customerId], references: [id])

  @@index([userId])
  @@index([customerId])
}
```

## Testing

### Manual Testing

1. **Connect Google Account**:
```bash
# Get auth URL
curl "http://localhost:3001/api/google-sheets/auth?userId=test_user&customerId=test_cust"

# Visit authUrl in browser, grant permission

# Exchange code for tokens (get code from redirect URL)
curl -X POST http://localhost:3001/api/google-sheets/auth \
  -H "Content-Type: application/json" \
  -d '{"code": "your-code", "state": "{\"userId\":\"test_user\",\"customerId\":\"test_cust\"}"}'
```

2. **List Spreadsheets**:
```bash
curl "http://localhost:3001/api/google-sheets/list?userId=test_user"
```

3. **Read Sheet**:
```bash
curl -X POST http://localhost:3001/api/google-sheets/read \
  -H "Content-Type: application/json" \
  -d '{"userId": "test_user", "spreadsheetId": "your-sheet-id", "sheetName": "Sheet1"}'
```

4. **Import Data**:
```bash
curl -X POST http://localhost:3001/api/google-sheets/import \
  -H "Content-Type: application/json" \
  -d @import-request.json
```

## Troubleshooting

### "Google Sheets not connected"
- User needs to go through OAuth flow first
- Call `GET /api/google-sheets/auth` to get authorization URL

### "Access token expired"
- System should auto-refresh using refresh token
- If refresh fails, user needs to reconnect

### "Unable to parse range"
- Sheet name is incorrect or doesn't exist
- Check available sheets first

### "Failed to refresh access token"
- Refresh token is invalid or revoked
- User needs to reconnect Google account

### "Validation errors"
- Data in Google Sheet doesn't match expected format
- Review error details and fix data in sheet

## Best Practices

1. **Always check token expiry** before making API calls
2. **Handle reauth gracefully** when tokens expire
3. **Show clear error messages** to users
4. **Log all imports** for audit trail
5. **Validate data** before importing
6. **Use transactions** for data consistency
7. **Limit error tolerance** (max 10 errors per import)

## Limitations

- **Read-only access**: Can only read sheets, not write
- **Max rows**: 10,000 rows per import
- **Rate limits**: Subject to Google API rate limits
- **Token expiry**: Access tokens expire after ~1 hour
- **Refresh token rotation**: Google may rotate refresh tokens

## Future Enhancements

1. **Auto-sync**: Automatically sync budgets when sheet changes
2. **Webhooks**: Receive notifications when sheet is updated
3. **Bidirectional sync**: Write budget changes back to sheet
4. **Template sheets**: Provide Google Sheet templates for easy setup
5. **Batch import**: Import from multiple sheets at once
6. **Scheduled imports**: Set up recurring imports
