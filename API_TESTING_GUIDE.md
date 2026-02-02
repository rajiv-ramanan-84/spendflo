# API Testing Guide

## How to Test Budget Availability

This guide shows you how to test if a budget is available for a purchase request.

## Scenario: Request for Salesforce Subscription

**Business User Story:**
> "I'm from the Sales department and want to purchase a Salesforce subscription for $15,000. Does my department have budget available?"

### Step 1: Go to Test API Console

Navigate to `/test` or click the "Test API" tile on the homepage.

### Step 2: Select "Check Budget" Endpoint

The "Check Budget" endpoint should be selected by default.

### Step 3: Modify the Request Body

Update the JSON request with your purchase details:

```json
{
  "customerId": "default-customer",
  "department": "Sales",
  "subCategory": "Tools",
  "fiscalPeriod": "FY2025",
  "amount": 15000,
  "currency": "USD"
}
```

**Field Explanations:**
- `customerId`: Leave as "default-customer" (auto-created)
- `department`: The department requesting budget (e.g., "Sales", "Engineering", "Marketing")
- `subCategory`: Optional - specific category within department (e.g., "Tools", "Software", "Hardware")
- `fiscalPeriod`: The budget period (e.g., "FY2025", "Q1-2025")
- `amount`: The amount you want to spend
- `currency`: "USD" or "GBP"

### Step 4: Click "Send Request"

The API will respond with:

**Success Response (Budget Available):**
```json
{
  "isAvailable": true,
  "budgetId": "clx...",
  "requestedAmount": 15000,
  "currency": "USD",
  "totalBudget": 250000,
  "committed": 0,
  "reserved": 0,
  "available": 250000,
  "utilizationPercent": 0,
  "reason": "Budget available"
}
```

**Failed Response (No Budget Found):**
```json
{
  "available": false,
  "reason": "No budget found for this department/category",
  "details": {
    "department": "Sales",
    "subCategory": "Tools",
    "fiscalPeriod": "FY2025"
  }
}
```

**Failed Response (Insufficient Budget):**
```json
{
  "isAvailable": false,
  "budgetId": "clx...",
  "requestedAmount": 300000,
  "currency": "USD",
  "totalBudget": 250000,
  "committed": 180000,
  "reserved": 20000,
  "available": 50000,
  "utilizationPercent": 80,
  "reason": "Insufficient budget"
}
```

## Testing Different Scenarios

### Test 1: Engineering Software Request
```json
{
  "department": "Engineering",
  "subCategory": "Software",
  "fiscalPeriod": "FY2025",
  "amount": 25000,
  "currency": "USD"
}
```

### Test 2: Marketing Campaign Request
```json
{
  "department": "Marketing",
  "subCategory": "Advertising",
  "fiscalPeriod": "FY2025",
  "amount": 50000,
  "currency": "USD"
}
```

### Test 3: Large Request (Test Insufficient Budget)
```json
{
  "department": "Sales",
  "subCategory": "Tools",
  "fiscalPeriod": "FY2025",
  "amount": 999999,
  "currency": "USD"
}
```

### Test 4: Currency Conversion (GBP to USD)
```json
{
  "department": "Sales",
  "subCategory": "Events",
  "fiscalPeriod": "FY2025",
  "amount": 10000,
  "currency": "GBP"
}
```
*Note: If the budget is in USD, the system will convert GBP to USD (~1.27 rate)*

## Full Workflow Test

### 1. Check Budget
Use the "Check Budget" endpoint to see if you have funds available.

### 2. Reserve Budget
If available, reserve it (soft hold for 48 hours):
```json
{
  "budgetId": "clx... (from check response)",
  "amount": 15000,
  "requestId": "req-001",
  "userId": "user-123",
  "reason": "Salesforce annual subscription"
}
```

### 3. Commit Budget
After approval, commit the budget (hard lock):
```json
{
  "budgetId": "clx...",
  "amount": 15000,
  "requestId": "req-001",
  "userId": "user-123",
  "reason": "Approved by manager",
  "wasReserved": true
}
```

### 4. Check Dashboard
Go to `/dashboard` to see the updated utilization and available budget.

### 5. Check Audit Log
Go to `/audit` to see the complete trail of actions (RESERVE → COMMIT).

## Common Questions

**Q: What if I don't know the budgetId?**
A: Use the "Check Budget" endpoint first - it returns the budgetId.

**Q: Can I check budget for a department that doesn't exist?**
A: Yes, but you'll get `available: false` with reason "No budget found".

**Q: What happens if I try to reserve more than available?**
A: The API returns `success: false` with error "Insufficient budget".

**Q: How do I see all budget changes?**
A: Visit `/audit` to see complete history with timestamps.

## Quick Reference

| Endpoint | Purpose | When to Use |
|----------|---------|-------------|
| `POST /api/budget/check` | Check availability | Before any purchase request |
| `POST /api/budget/reserve` | Soft hold | When request enters approval |
| `POST /api/budget/commit` | Hard lock | When request is approved |
| `POST /api/budget/release` | Free up budget | When request is cancelled/rejected |
| `GET /api/budget/status/{id}` | Get budget details | Check specific budget status |

## Integration with SpendFlo

When integrating with SpendFlo's workflow:

1. **User creates purchase request** → SpendFlo calls `check` API
2. **Request enters approval** → SpendFlo calls `reserve` API
3. **Manager approves** → SpendFlo calls `commit` API with `wasReserved: true`
4. **Manager rejects** → SpendFlo calls `release` API with `type: "reserved"`

This ensures budget is properly tracked throughout the approval lifecycle.
