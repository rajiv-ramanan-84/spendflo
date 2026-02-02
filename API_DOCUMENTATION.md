# SpendFlo Budget Service - API Documentation

## Overview

This service provides budget management APIs for integration with SpendFlo's workflow engine. All APIs are RESTful and use JSON for request/response bodies.

**Base URL**: Your Railway deployment URL (check Railway dashboard)

## Authentication

Currently, the APIs are open. Add authentication headers as needed when integrating with SpendFlo.

---

## API Endpoints

### 1. Check Budget Availability

Verify if sufficient budget is available for a request.

**Endpoint**: `POST /api/budget/check`

**Request Body**:
```json
{
  "customerId": "customer-id",
  "department": "Engineering",
  "subCategory": "Software",
  "fiscalPeriod": "FY2025",
  "amount": 10000,
  "currency": "USD"
}
```

**Response**:
```json
{
  "isAvailable": true,
  "budgetId": "budget-id-here",
  "requestedAmount": 10000,
  "currency": "USD",
  "totalBudget": 500000,
  "committed": 250000,
  "reserved": 50000,
  "available": 200000,
  "utilizationPercent": 60,
  "reason": "Budget available"
}
```

**Notes**:
- `subCategory` is optional
- `currency` defaults to USD if not specified
- Automatic currency conversion between USD and GBP (GBP to USD ~1.27, USD to GBP ~0.79)
- Returns `isAvailable: false` if no budget found or insufficient funds

---

### 2. Reserve Budget

Create a soft hold on budget (48-hour reservation).

**Endpoint**: `POST /api/budget/reserve`

**Request Body**:
```json
{
  "budgetId": "budget-id-here",
  "amount": 5000,
  "requestId": "req-123",
  "userId": "user-456",
  "reason": "Pending approval"
}
```

**Response**:
```json
{
  "success": true,
  "reservationId": "req-123",
  "amount": 5000,
  "newReserved": 55000,
  "newAvailable": 195000
}
```

**Notes**:
- Reservations are soft locks - budget cannot be used by others
- `requestId` is optional but recommended for tracking
- `userId` is optional but helps with audit logs
- `reason` is optional
- Returns error if insufficient budget

---

### 3. Commit Budget

Hard lock on budget (approved spend).

**Endpoint**: `POST /api/budget/commit`

**Request Body**:
```json
{
  "budgetId": "budget-id-here",
  "amount": 5000,
  "requestId": "req-123",
  "userId": "user-456",
  "reason": "Approved purchase",
  "wasReserved": true
}
```

**Response**:
```json
{
  "success": true,
  "commitmentId": "req-123",
  "amount": 5000,
  "newCommitted": 255000,
  "newReserved": 50000,
  "newAvailable": 195000
}
```

**Notes**:
- `wasReserved: true` will release the reservation and commit in one transaction
- If `wasReserved: false`, will commit directly from available budget
- Committed budget cannot be released without manual intervention
- Returns error if insufficient budget

---

### 4. Release Budget

Release reserved or committed budget (cancel/reject).

**Endpoint**: `POST /api/budget/release`

**Request Body**:
```json
{
  "budgetId": "budget-id-here",
  "amount": 5000,
  "type": "reserved",
  "requestId": "req-123",
  "userId": "user-456",
  "reason": "Request cancelled"
}
```

**Response**:
```json
{
  "success": true,
  "releaseId": "req-123",
  "amount": 5000,
  "type": "reserved",
  "newCommitted": 250000,
  "newReserved": 50000,
  "newAvailable": 200000
}
```

**Notes**:
- `type` can be "reserved" or "committed"
- Use "reserved" when canceling a pending request
- Use "committed" when reversing an approved spend (rare)
- Amount cannot exceed current reserved/committed amount

---

### 5. Get Budget Status

Get detailed status of a specific budget.

**Endpoint**: `GET /api/budget/status/{budgetId}`

**Response**:
```json
{
  "id": "budget-id",
  "customer": "Acme Corporation",
  "department": "Engineering",
  "subCategory": "Software",
  "fiscalPeriod": "FY2025",
  "currency": "USD",
  "totalBudget": 500000,
  "committed": 250000,
  "reserved": 50000,
  "available": 200000,
  "utilizationPercent": 60,
  "status": "healthy",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-20T14:30:00Z"
}
```

**Status Values**:
- `healthy`: < 70% utilized
- `warning`: 70-80% utilized
- `high-risk`: 80-90% utilized
- `critical`: > 90% utilized

---

### 6. Dashboard Statistics

Get overall budget health metrics.

**Endpoint**: `GET /api/dashboard/stats?customerId={customerId}`

**Response**:
```json
{
  "summary": {
    "totalBudget": 1050000,
    "totalCommitted": 580000,
    "totalReserved": 100000,
    "totalAvailable": 370000,
    "totalUtilizationPercent": 64.76
  },
  "health": {
    "healthy": 2,
    "warning": 1,
    "highRisk": 0,
    "critical": 0
  },
  "criticalBudgets": [],
  "totalBudgets": 3
}
```

**Notes**:
- `customerId` query parameter is optional
- Without `customerId`, returns stats for all customers
- `criticalBudgets` array contains budgets with >90% utilization

---

## Workflow Integration Example

### Typical SpendFlo Workflow Integration

1. **User creates purchase request in SpendFlo**
   - SpendFlo calls `POST /api/budget/check` to verify budget availability
   - If unavailable, reject immediately with reason

2. **Request enters approval workflow**
   - SpendFlo calls `POST /api/budget/reserve` to hold budget
   - Budget is soft-locked for 48 hours

3. **Request is approved**
   - SpendFlo calls `POST /api/budget/commit` with `wasReserved: true`
   - Budget moves from reserved to committed

4. **Request is rejected or cancelled**
   - SpendFlo calls `POST /api/budget/release` with `type: "reserved"`
   - Budget is released back to available pool

5. **Monitor budget health**
   - SpendFlo periodically calls `GET /api/dashboard/stats`
   - Alert finance team if critical budgets detected

---

## Error Handling

All APIs return standard HTTP status codes:

- `200 OK`: Successful operation
- `400 Bad Request`: Missing or invalid parameters
- `404 Not Found`: Budget not found
- `500 Internal Server Error`: Server error

Error response format:
```json
{
  "error": "Error message here",
  "details": "Additional details if available"
}
```

---

## Rate Limiting

Currently no rate limiting. Add as needed for production.

---

## Support

For issues or questions:
- View audit log at `/audit` for all budget changes
- Check dashboard at `/dashboard` for budget health
- Test APIs at `/test` using the interactive console

---

## Change Log

### Version 1.0 (Current)
- Initial release
- 5 core budget APIs
- Currency support (USD/GBP)
- Audit logging
- Budget health monitoring
