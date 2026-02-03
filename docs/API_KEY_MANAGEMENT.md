# API Key Management System

## Overview

The API Key Management system provides secure, permission-based API access for programmatic integrations. Users can create, manage, and revoke API keys with fine-grained permissions.

## Features

- **Secure Key Generation**: Cryptographically secure random keys with `sfb_live_` prefix
- **SHA-256 Hashing**: Keys are hashed before storage (plain key shown only once)
- **Permission-Based Access**: Fine-grained permissions for different API operations
- **Usage Tracking**: Monitor API key usage with detailed logs
- **Expiration Support**: Optional expiration dates for keys
- **Revocation**: Instantly revoke compromised keys
- **Audit Logging**: All key operations are logged for security

## UI Features

### API Keys Page (`/api-keys`)

1. **List View**:
   - View all API keys for your organization
   - See key status (active, revoked, expired)
   - View usage count and last used date
   - Filter by status

2. **Create Key**:
   - Name your key for easy identification
   - Select permissions
   - Set optional expiration
   - Copy key immediately (shown only once)

3. **Key Actions**:
   - **Revoke**: Disable key immediately
   - **Delete**: Permanently remove key
   - **View Usage**: See detailed usage statistics

### Key Display

- **Prefix Only**: Only first 8 characters shown (`sfb_live_abc...`)
- **One-time Display**: Full key shown only at creation
- **Copy Button**: Easy copy-to-clipboard functionality
- **Warning**: Clear warning that key won't be shown again

## API Endpoints

### 1. List API Keys

**Endpoint**: `GET /api/api-keys?customerId={customerId}&status={status}`

**Parameters**:
- `customerId` (required): Customer ID
- `status` (optional): Filter by status (active, revoked, expired, all)

**Response**:
```json
{
  "success": true,
  "apiKeys": [
    {
      "id": "key_123",
      "name": "Production API",
      "keyPrefix": "sfb_live_abc",
      "status": "active",
      "permissions": ["budget.read", "request.create"],
      "usageCount": 1523,
      "lastUsedAt": "2025-01-15T10:30:00Z",
      "expiresAt": null,
      "createdAt": "2025-01-01T00:00:00Z",
      "createdBy": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

### 2. Create API Key

**Endpoint**: `POST /api/api-keys`

**Request**:
```json
{
  "customerId": "cust_123",
  "createdById": "user_123",
  "name": "Production API",
  "permissions": ["budget.read", "request.create"],
  "expiresInDays": 90
}
```

**Response**:
```json
{
  "success": true,
  "apiKey": {
    "id": "key_123",
    "name": "Production API",
    "key": "sfb_live_abc123def456ghi789jkl012mno345pqr678stu",
    "keyPrefix": "sfb_live_abc",
    "status": "active",
    "permissions": ["budget.read", "request.create"],
    "expiresAt": "2025-04-15T00:00:00Z",
    "createdAt": "2025-01-15T00:00:00Z",
    "createdBy": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  },
  "warning": "This is the only time you will see this key. Please copy it now."
}
```

**⚠️ Important**: The full `key` value is returned only once. Store it securely.

### 3. Update API Key

**Endpoint**: `PATCH /api/api-keys`

**Request**:
```json
{
  "apiKeyId": "key_123",
  "status": "revoked",
  "name": "Old Production API",
  "permissions": ["budget.read"]
}
```

**Response**:
```json
{
  "success": true,
  "apiKey": {
    "id": "key_123",
    "name": "Old Production API",
    "keyPrefix": "sfb_live_abc",
    "status": "revoked",
    "permissions": ["budget.read"],
    "usageCount": 1523,
    "lastUsedAt": "2025-01-15T10:30:00Z",
    "expiresAt": null,
    "createdAt": "2025-01-01T00:00:00Z",
    "createdBy": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

### 4. Delete API Key

**Endpoint**: `DELETE /api/api-keys?apiKeyId={apiKeyId}`

**Response**:
```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

### 5. Get Usage Statistics

**Endpoint**: `GET /api/api-keys/usage?apiKeyId={apiKeyId}&days={days}`

**Parameters**:
- `apiKeyId` or `customerId` (required): Filter by key or customer
- `days` (optional): Number of days to include (default: 30)
- `limit` (optional): Max logs to return (default: 100)

**Response**:
```json
{
  "success": true,
  "stats": {
    "totalRequests": 1523,
    "successfulRequests": 1485,
    "failedRequests": 38,
    "uniqueIpAddresses": 5,
    "uniqueEndpoints": 8
  },
  "byDate": {
    "2025-01-15": 145,
    "2025-01-14": 132,
    "2025-01-13": 156
  },
  "byEndpoint": {
    "/api/budget/check": 650,
    "/api/requests/submit": 450,
    "/api/budgets": 423
  },
  "byStatus": {
    "success": 1485,
    "failed": 38
  },
  "recentLogs": [
    {
      "id": "log_123",
      "apiKey": {
        "id": "key_123",
        "name": "Production API",
        "keyPrefix": "sfb_live_abc"
      },
      "endpoint": "/api/budget/check",
      "method": "POST",
      "status": "success",
      "ipAddress": "192.168.1.1",
      "userAgent": "MyApp/1.0",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

## Available Permissions

### Budget Permissions
- `budget.read` - View budgets
- `budget.create` - Create new budgets
- `budget.update` - Update existing budgets
- `budget.delete` - Delete budgets

### Request Permissions
- `request.read` - View budget requests
- `request.create` - Submit budget requests
- `request.approve` - Approve requests (FP&A only)
- `request.reject` - Reject requests (FP&A only)

### Import Permissions
- `import.create` - Import budgets from CSV/Sheets
- `import.read` - View import history

### Admin Permissions
- `admin.*` - Full admin access (super admin only)

## Using API Keys

### Authentication Header

Include API key in all requests:

```bash
curl -X POST https://api.example.com/api/budget/check \
  -H "Authorization: Bearer sfb_live_abc123def456ghi789jkl012mno345pqr678stu" \
  -H "Content-Type: application/json" \
  -d '{"department": "Engineering", "amount": 5000}'
```

### Authentication Flow

1. Client sends request with API key in `Authorization` header
2. Server extracts key from header
3. Server hashes key with SHA-256
4. Server looks up hashed key in database
5. Server validates:
   - Key exists
   - Status is "active"
   - Not expired
   - Has required permission for endpoint
6. Server logs usage
7. Server processes request

### Error Responses

**Invalid Key**:
```json
{
  "error": "Invalid API key",
  "status": 401
}
```

**Revoked Key**:
```json
{
  "error": "API key has been revoked",
  "status": 401
}
```

**Expired Key**:
```json
{
  "error": "API key has expired",
  "status": 401
}
```

**Insufficient Permissions**:
```json
{
  "error": "Forbidden. Required permission: budget.create",
  "status": 403
}
```

## Security Best Practices

### For Developers

1. **Never Commit Keys**: Never commit API keys to Git
2. **Use Environment Variables**: Store keys in `.env` files
3. **Rotate Regularly**: Rotate keys every 90 days
4. **Principle of Least Privilege**: Only grant necessary permissions
5. **Monitor Usage**: Regularly review usage logs for anomalies
6. **Revoke Immediately**: Revoke compromised keys immediately
7. **Use HTTPS**: Always use HTTPS in production

### For Administrators

1. **Regular Audits**: Review all active API keys monthly
2. **Remove Unused Keys**: Delete keys that haven't been used in 90 days
3. **Monitor Failed Attempts**: Alert on unusual failed authentication attempts
4. **Set Expiration**: Require expiration dates for all keys
5. **Two-Person Rule**: Require approval for admin-level keys
6. **IP Whitelisting**: Consider IP restrictions (future enhancement)

## Key Format

```
sfb_live_abc123def456ghi789jkl012mno345pqr678stu
│    │    └─────────────────────┬─────────────────────┘
│    │                          │
│    │                          └─ Random secure token (40 chars)
│    └─ Environment (live/test)
└─ Prefix (SpendFlo Budget)
```

- **Total Length**: 49 characters
- **Prefix**: `sfb_` (SpendFlo Budget)
- **Environment**: `live_` or `test_`
- **Token**: 40 characters (cryptographically secure random)

## Database Schema

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  name        String
  key         String    @unique // SHA-256 hashed
  keyPrefix   String    // First 8 chars for display
  customerId  String
  createdById String
  status      String    @default("active") // active, revoked, expired
  permissions String[]
  usageCount  Int       @default(0)
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @default(now()) @updatedAt

  customer    Customer           @relation(fields: [customerId], references: [id])
  createdBy   User               @relation(fields: [createdById], references: [id])
  usageLogs   ApiKeyUsageLog[]

  @@index([customerId])
  @@index([key])
  @@index([status])
}

model ApiKeyUsageLog {
  id          String   @id @default(cuid())
  apiKeyId    String
  customerId  String
  endpoint    String
  method      String
  status      String   // success, failed
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  apiKey      ApiKey   @relation(fields: [apiKeyId], references: [id])

  @@index([apiKeyId])
  @@index([customerId])
  @@index([createdAt])
}
```

## Monitoring & Analytics

### Usage Dashboard

Track:
- Total requests per day/week/month
- Success vs. failure rates
- Most-used endpoints
- Geographic distribution (by IP)
- User agent analysis

### Alerts

Set up alerts for:
- Unusual spike in usage
- High failure rate
- Access from new IP addresses
- Keys approaching expiration

### Reports

Generate reports for:
- Monthly API usage summary
- Inactive keys (no usage in 30+ days)
- Keys expiring soon
- Failed authentication attempts

## Testing

### Create Test Key

```bash
curl -X POST http://localhost:3001/api/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_cust",
    "createdById": "test_user",
    "name": "Test API Key",
    "permissions": ["budget.read", "request.read"],
    "expiresInDays": 30
  }'
```

### Test Authentication

```bash
# Use the key from previous response
curl -X POST http://localhost:3001/api/budget/check \
  -H "Authorization: Bearer sfb_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_cust",
    "department": "Engineering",
    "amount": 5000,
    "fiscalPeriod": "FY2025"
  }'
```

### Revoke Test Key

```bash
curl -X PATCH http://localhost:3001/api/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "apiKeyId": "key_123",
    "status": "revoked"
  }'
```

## Troubleshooting

### "Invalid API key"
- Key is malformed or doesn't exist
- Verify key was copied correctly
- Check if key was deleted

### "API key has been revoked"
- Key was manually revoked
- Create a new key

### "API key has expired"
- Key passed expiration date
- Create a new key with new expiration

### "Forbidden"
- Key lacks required permission
- Update key permissions or use different key

## Future Enhancements

1. **IP Whitelisting**: Restrict keys to specific IP addresses
2. **Rate Limiting**: Per-key rate limits
3. **Webhook Support**: Trigger webhooks on key usage
4. **Key Rotation**: Automatic key rotation
5. **Scope Restrictions**: Limit keys to specific resources
6. **Temporary Keys**: Short-lived keys for temporary access
7. **Key Templates**: Predefined permission sets
