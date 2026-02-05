# Workflow Orchestrator Integration Guide

This guide explains how Spendflo's workflow orchestrator integrates with the Budget Sync System.

---

## 📋 Complete Workflow

### Scenario 1: Budget Available - Auto-Approve

```
1. User submits intake request in Spendflo
   ├─ Vendor: Slack
   ├─ Purpose: Team collaboration  
   ├─ Amount: $5,000
   └─ Department: Engineering

2. Workflow Orchestrator processes request
   └─ Finds "Budget Check" step in workflow

3. Orchestrator calls Budget Check API
   POST /api/budget/check
   {
     "requestId": "intake-789",
     "userId": "user-123",
     "userName": "Jane Doe",
     "userEmail": "jane@acme.com",
     "customerId": "org-456",
     "department": "Engineering",
     "fiscalPeriod": "Q1 2025",
     "amount": 5000,
     "vendor": "Slack",
     "purpose": "Team collaboration"
   }

4. Budget Check API responds
   {
     "success": true,
     "available": true,
     "canAutoApprove": true,
     "budget": {
       "budgetedAmount": 100000,
       "available": 95000
     }
   }

5. Orchestrator reserves budget (because available = true)
   POST /api/budget/reserve
   {
     "budgetId": "budget-123",
     "amount": 5000,
     "requestId": "intake-789",
     "reason": "Slack - Team collaboration"
   }

6. Orchestrator continues workflow
   └─ Auto-approved (canAutoApprove = true)
   └─ Proceeds to fulfillment
```

---

### Scenario 2: Budget Available - Requires Approval

```
1-4. [Same as Scenario 1]

4. Budget Check API responds
   {
     "success": true,
     "available": true,
     "canAutoApprove": false,  ← Exceeds threshold
     "reason": "Budget available. Requires FP&A approval"
   }

5. Orchestrator reserves budget
   POST /api/budget/reserve
   [Same as Scenario 1]

6. Orchestrator routes to FP&A for approval
   └─ If approved → Proceeds to fulfillment
   └─ If rejected → Release budget (see Scenario 4)
```

---

### Scenario 3: Budget Not Available

```
1-3. [Same as Scenario 1]

4. Budget Check API responds
   {
     "success": true,
     "available": false,  ← Insufficient budget
     "reason": "Insufficient budget. Available: $2,000, Requested: $5,000"
   }

5. Orchestrator does NOT reserve budget

6. Orchestrator routes to FP&A
   └─ FP&A can manually approve (over-budget)
   └─ Or reject the request
```

---

### Scenario 4: Request Rejection - Release Budget

```
1-5. [Request was approved and budget reserved]

6. Request gets rejected (by approver or automated rule)

7. Orchestrator calls Budget Release API
   POST /api/budget/release
   {
     "budgetId": "budget-123",
     "amount": 5000,
     "requestId": "intake-789",
     "action": "reject",
     "reason": "Duplicate subscription found"
   }

8. Budget Release API responds
   {
     "success": true,
     "amountReleased": 5000,
     "newAvailable": 97000
   }

9. Budget is released and available for other requests
```

---

### Scenario 5: Request Cancellation - User Cancels

```
1-5. [Request was approved and budget reserved]

6. User cancels their own request

7. Orchestrator calls Budget Release API
   POST /api/budget/release
   {
     "budgetId": "budget-123",
     "amount": 5000,
     "requestId": "intake-789",
     "action": "cancel",
     "originalRequesterId": "user-123",  ← User who submitted
     "reason": "No longer needed"
   }

8. Budget Release API verifies user owns the request
   └─ Checks: user.id === originalRequesterId
   └─ If match → Release budget
   └─ If no match → 403 Forbidden

9. Budget is released
```

---

## 🔒 Role-Based Access Control

### Budget Release Permissions

| Role | Can Release Any Budget | Can Cancel Own Request |
|------|----------------------|----------------------|
| FP&A Admin | ✅ Yes | ✅ Yes |
| FP&A User | ✅ Yes | ✅ Yes |
| Super Admin | ✅ Yes | ✅ Yes |
| Admin | ✅ Yes | ✅ Yes |
| Manager | ❌ No | ✅ Yes (own only) |
| Employee | ❌ No | ✅ Yes (own only) |

### User Roles in Database

Based on Prisma schema (User.role):
- `super_admin` - Full system access
- `fpa_admin` - FP&A administrator
- `fpa_user` - FP&A team member
- `business_user` - Regular employee
- `api_system` - Service accounts

---

## 📊 Audit Trail

### Every Budget Check is Logged

```sql
SELECT * FROM "BudgetCheckLog" 
WHERE "requestId" = 'intake-789';
```

Returns:
```json
{
  "requestId": "intake-789",
  "userId": "user-123",
  "userName": "Jane Doe",
  "userEmail": "jane@acme.com",
  "department": "Engineering",
  "amount": 5000,
  "available": true,
  "canAutoApprove": true,
  "timestamp": "2025-02-05T10:30:00Z",
  "response": { /* full API response */ }
}
```

### Every Budget Release is Logged

```sql
SELECT * FROM "AuditLog" 
WHERE "budgetId" = 'budget-123' 
AND "action" = 'RELEASE';
```

Returns:
```json
{
  "budgetId": "budget-123",
  "action": "RELEASE",
  "oldValue": "5000",
  "newValue": "0",
  "changedBy": "Jane Doe (jane@acme.com)",
  "reason": "Request cancelled by user",
  "createdAt": "2025-02-05T11:00:00Z"
}
```

---

## 🔄 Google Sheets Sync

### Hourly Sync Process

```
Every hour at :00 (via Vercel Cron):

1. Cron job triggers: GET /api/cron/sync-google-sheets
   └─ Requires: Authorization: Bearer {CRON_SECRET}

2. Find all active Google Sheets configurations
   └─ Query: BudgetDataSourceConfig WHERE sourceType = 'google_sheets'

3. For each configuration:
   ├─ Fetch budgets from Google Sheet
   ├─ Compare with database
   ├─ Create new budgets
   ├─ Update changed budgets
   └─ Soft-delete removed budgets

4. Record sync history
   └─ SyncHistory table tracks stats and errors
```

### Sync History

```sql
SELECT * FROM "SyncHistory" 
WHERE "customerId" = 'org-456'
ORDER BY "startTime" DESC 
LIMIT 10;
```

Returns recent sync results:
```json
{
  "syncId": "sync_1707134400_org-456",
  "status": "success",
  "createdCount": 3,
  "updatedCount": 5,
  "unchangedCount": 42,
  "softDeletedCount": 1,
  "durationMs": 2340,
  "startTime": "2025-02-05T10:00:00Z"
}
```

---

## 🧪 Testing APIs

### Test Budget Check

```bash
curl -X POST https://spendflo.vercel.app/api/budget/check \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "test-001",
    "userId": "user-123",
    "userName": "Test User",
    "userEmail": "test@example.com",
    "customerId": "org-456",
    "department": "Engineering",
    "fiscalPeriod": "Q1 2025",
    "amount": 5000
  }'
```

### Test Budget Reserve

```bash
curl -X POST https://spendflo.vercel.app/api/budget/reserve \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie" \
  -d '{
    "budgetId": "budget-123",
    "amount": 5000,
    "requestId": "test-001",
    "reason": "Test reservation"
  }'
```

### Test Budget Release

```bash
curl -X POST https://spendflo.vercel.app/api/budget/release \
  -H "Content-Type: application/json" \
  -H "Cookie: your_session_cookie" \
  -d '{
    "budgetId": "budget-123",
    "amount": 5000,
    "requestId": "test-001",
    "action": "reject",
    "reason": "Test rejection"
  }'
```

---

## 🚀 Environment Variables

Required environment variables:

```bash
# Database
DATABASE_URL="postgresql://..."

# Cron Security
CRON_SECRET="your-secure-random-string"

# For production, also configure:
# - Google Sheets OAuth credentials
# - Session secret for user authentication
```

---

## 📞 Error Handling

### Budget Check Errors

| Error | Status | Meaning | Action |
|-------|--------|---------|--------|
| Missing fields | 400 | Required fields not provided | Fix request payload |
| Invalid customer | 400 | Customer ID doesn't exist | Verify customerId |
| No budget found | 200 | No matching budget | Response: `available: false` |
| Internal error | 500 | Database/system error | Check logs, retry |

### Budget Release Errors

| Error | Status | Meaning | Action |
|-------|--------|---------|--------|
| Authentication required | 401 | No valid session | User must log in |
| Forbidden | 403 | User lacks permission | Check role permissions |
| Budget not found | 404 | Invalid budgetId | Verify budgetId |
| Amount exceeds reserved | 200 | Trying to release more than reserved | Check reserved amount |

---

## 📈 Monitoring

### Key Metrics to Track

1. **Budget Check Success Rate**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE available = true) * 100.0 / COUNT(*) as success_rate
   FROM "BudgetCheckLog"
   WHERE timestamp > NOW() - INTERVAL '24 hours';
   ```

2. **Average Response Time**
   - Monitor API response times
   - Alert if > 2 seconds

3. **Sync Success Rate**
   ```sql
   SELECT 
     COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) as sync_success_rate
   FROM "SyncHistory"
   WHERE "startTime" > NOW() - INTERVAL '7 days';
   ```

4. **Budget Utilization**
   ```sql
   SELECT 
     department,
     SUM("budgetedAmount") as total_budget,
     SUM("reservedAmount" + "committedAmount") as used,
     SUM("budgetedAmount") - SUM("reservedAmount" + "committedAmount") as available
   FROM "Budget"
   LEFT JOIN "BudgetUtilization" ON "Budget".id = "BudgetUtilization"."budgetId"
   GROUP BY department;
   ```

---

## ✅ Integration Checklist

Before going live:

- [ ] Configure `CRON_SECRET` environment variable
- [ ] Update `getUserFromRequest()` with Spendflo's auth
- [ ] Test budget check with orchestrator
- [ ] Test budget reserve flow
- [ ] Test budget release (cancel, reject, manual)
- [ ] Verify audit logs are being created
- [ ] Test Google Sheets sync (if applicable)
- [ ] Set up monitoring alerts
- [ ] Load test with expected request volume
- [ ] Document orchestrator API integration

---

## 🆘 Support

For issues or questions:
1. Check audit logs: `SELECT * FROM "BudgetCheckLog" ORDER BY timestamp DESC LIMIT 10`
2. Check sync history: `SELECT * FROM "SyncHistory" ORDER BY "startTime" DESC LIMIT 5`
3. Check error logs in Vercel dashboard
4. Review this guide's error handling section
