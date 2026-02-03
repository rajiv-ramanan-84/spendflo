# Production Deployment Test Plan

## Prerequisites
- Production URL: `https://your-app.vercel.app`
- All environment variables configured in Vercel
- Database migrated

---

## Test 1: Health Check ✓
**Verify the app is running**

```bash
curl https://your-app.vercel.app/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "database": "connected"
}
```

---

## Test 2: User Registration & Authentication ✓
**Create a test user and login**

### 2.1 Register User
```bash
curl -X POST https://your-app.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@spendflo.com",
    "password": "TestPassword123!",
    "name": "Test User",
    "customerId": "test_customer_001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_xxx",
    "email": "test@spendflo.com",
    "name": "Test User"
  },
  "token": "eyJhbGc..."
}
```

**Save the token for next steps!**

### 2.2 Login
```bash
curl -X POST https://your-app.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@spendflo.com",
    "password": "TestPassword123!"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": { ... }
}
```

---

## Test 3: API Key Management ✓
**Create and test API keys**

### 3.1 Create API Key
```bash
export TOKEN="your-jwt-token-from-login"

curl -X POST https://your-app.vercel.app/api/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test API Key",
    "permissions": ["budget.read", "budget.write"],
    "customerId": "test_customer_001",
    "createdById": "user_xxx"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "apiKey": {
    "id": "key_xxx",
    "name": "Test API Key",
    "key": "sfb_live_xxxxxxxxxxxxxxxxxx",
    "keyPrefix": "sfb_live_xxxxxx",
    "status": "active"
  }
}
```

**⚠️ IMPORTANT: Copy the full API key - it won't be shown again!**

### 3.2 List API Keys
```bash
curl https://your-app.vercel.app/api/api-keys?customerId=test_customer_001 \
  -H "Authorization: Bearer $TOKEN"
```

### 3.3 Test API Key Authentication
```bash
export API_KEY="sfb_live_your-api-key"

curl https://your-app.vercel.app/api/health \
  -H "Authorization: Bearer $API_KEY"
```

---

## Test 4: Budget Operations ✓
**Create budgets and check availability**

### 4.1 Create Budget
```bash
curl -X POST https://your-app.vercel.app/api/budgets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer_001",
    "department": "Engineering",
    "subCategory": "Software",
    "fiscalPeriod": "Q1 2025",
    "budgetedAmount": 50000,
    "currency": "USD"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "budget": {
    "id": "budget_xxx",
    "department": "Engineering",
    "budgetedAmount": 50000,
    "utilization": {
      "committedAmount": 0,
      "reservedAmount": 0
    }
  }
}
```

### 4.2 Check Budget Availability
```bash
curl -X POST https://your-app.vercel.app/api/budget/check \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer_001",
    "department": "Engineering",
    "amount": 5000,
    "fiscalPeriod": "Q1 2025"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "available": true,
  "budget": {
    "budgetedAmount": 50000,
    "committed": 0,
    "reserved": 0,
    "available": 50000
  }
}
```

---

## Test 5: Auto-Approval Engine ✓
**Test the smart approval logic**

### 5.1 Small Request (Should Auto-Approve)
```bash
curl -X POST https://your-app.vercel.app/api/requests/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer_001",
    "supplier": "AWS",
    "description": "Cloud hosting services",
    "amount": 2000,
    "department": "Engineering",
    "fiscalPeriod": "Q1 2025",
    "createdById": "user_xxx"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "request": {
    "id": "req_xxx",
    "status": "approved",
    "approvalReason": "Auto-approved: Amount within threshold"
  },
  "autoApproved": true
}
```

### 5.2 Large Request (Should Require Approval)
```bash
curl -X POST https://your-app.vercel.app/api/requests/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer_001",
    "supplier": "Salesforce",
    "description": "Annual enterprise license",
    "amount": 50000,
    "department": "Engineering",
    "fiscalPeriod": "Q1 2025",
    "createdById": "user_xxx"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "request": {
    "id": "req_xxx",
    "status": "pending",
    "approvalReason": "Requires FP&A approval: Amount exceeds threshold"
  },
  "autoApproved": false
}
```

### 5.3 Excessive Request (Should Reject)
```bash
curl -X POST https://your-app.vercel.app/api/requests/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer_001",
    "supplier": "Oracle",
    "description": "Enterprise database",
    "amount": 200000,
    "department": "Engineering",
    "fiscalPeriod": "Q1 2025",
    "createdById": "user_xxx"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "request": {
    "id": "req_xxx",
    "status": "rejected",
    "approvalReason": "Rejected: Amount exceeds available budget"
  },
  "autoApproved": false
}
```

---

## Test 6: AI Column Mapping ✓
**Test CSV import with AI mapping**

### 6.1 Prepare Test CSV
Create `test-budget.csv`:
```csv
Department,Category,Quarter,Budget Amount,Currency
Engineering,Software,Q1 2025,50000,USD
Marketing,Advertising,Q1 2025,30000,USD
Sales,Travel,Q1 2025,20000,USD
```

### 6.2 Upload and Get AI Mapping
```bash
curl -X POST https://your-app.vercel.app/api/imports/ai-map \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-budget.csv"
```

**Expected Response:**
```json
{
  "success": true,
  "mappings": [
    {
      "sourceColumn": "Department",
      "targetField": "department",
      "confidence": 1.0,
      "sampleValues": ["Engineering", "Marketing", "Sales"]
    },
    {
      "sourceColumn": "Budget Amount",
      "targetField": "budgetedAmount",
      "confidence": 0.95,
      "sampleValues": ["50000", "30000", "20000"]
    }
  ],
  "canProceed": true
}
```

### 6.3 Execute Import
```bash
curl -X POST https://your-app.vercel.app/api/imports/execute \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-budget.csv" \
  -F "customerId=test_customer_001" \
  -F "createdById=user_xxx" \
  -F 'mappings=[{"sourceColumn":"Department","targetField":"department"}]'
```

**Expected Response:**
```json
{
  "success": true,
  "importHistory": {
    "id": "import_xxx",
    "totalRows": 3,
    "successCount": 3,
    "failureCount": 0,
    "status": "completed"
  }
}
```

---

## Test 7: Google Sheets Integration ✓
**Test Google Sheets connection (if configured)**

### 7.1 Initiate OAuth
Visit in browser:
```
https://your-app.vercel.app/api/google-sheets/auth?userId=user_xxx&customerId=test_customer_001
```

### 7.2 List Spreadsheets
```bash
curl https://your-app.vercel.app/api/google-sheets/list?userId=user_xxx \
  -H "Authorization: Bearer $TOKEN"
```

### 7.3 Read and Map Sheet
```bash
curl -X POST https://your-app.vercel.app/api/google-sheets/read \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_xxx",
    "spreadsheetId": "your-sheet-id",
    "sheetName": "Sheet1"
  }'
```

---

## Test 8: Dashboard & UI ✓
**Test frontend pages**

### 8.1 Visit Dashboard
```
https://your-app.vercel.app/dashboard
```

### 8.2 Visit API Keys Page
```
https://your-app.vercel.app/api-keys
```

### 8.3 Visit Budgets Page
```
https://your-app.vercel.app/budgets
```

---

## Test 9: Performance & Load ✓
**Basic performance checks**

### 9.1 Response Times
```bash
time curl https://your-app.vercel.app/api/health
```

**Expected**: < 200ms

### 9.2 Concurrent Requests
```bash
for i in {1..10}; do
  curl https://your-app.vercel.app/api/health &
done
wait
```

**Expected**: All succeed

---

## Test 10: Error Handling ✓
**Verify proper error responses**

### 10.1 Invalid Authentication
```bash
curl https://your-app.vercel.app/api/budgets \
  -H "Authorization: Bearer invalid-token"
```

**Expected Response:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 10.2 Missing Required Fields
```bash
curl -X POST https://your-app.vercel.app/api/budgets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer_001"
  }'
```

**Expected Response:**
```json
{
  "error": "Validation failed",
  "details": ["department is required", "budgetedAmount is required"]
}
```

---

## Success Criteria ✅

All tests should pass with:
- ✅ 200-201 status codes for successful operations
- ✅ 400-401 status codes for validation/auth errors
- ✅ Response times < 500ms for simple operations
- ✅ Correct data returned in all responses
- ✅ Auto-approval logic working correctly
- ✅ Database transactions working (no orphaned records)

---

## Rollback Plan 🔄

If any critical issues found:

1. **Quick Fix**: Push fix to GitHub → Vercel auto-deploys
2. **Rollback**: In Vercel dashboard → Deployments → Select previous → "Promote to Production"
3. **Emergency**: Disable auto-deployment, fix locally, redeploy

---

## Next Steps After Testing 🚀

1. Set up monitoring (Vercel Analytics, Sentry)
2. Configure custom domain
3. Set up automated backups
4. Document API endpoints
5. Create user onboarding guide
6. Set up CI/CD with automated tests
7. Configure rate limiting
8. Set up log aggregation

---

## Support & Issues 📞

- **Build Issues**: Check Vercel build logs
- **Runtime Errors**: Check Vercel function logs
- **Database Issues**: Check Neon dashboard
- **Code Issues**: GitHub repository

