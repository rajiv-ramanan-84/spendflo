# Budget Check API - Quick Testing Guide

## What is the Budget Check API?

The Budget Check API (`/api/budget/check`) is used by **workflow systems** to check if a budget is available for a purchase request **before** creating the request in the system.

### Workflow Integration Flow:

```
User Creates Purchase Request
           ↓
Workflow calls /api/budget/check
           ↓
API checks budget availability
           ↓
    ┌─────────┴─────────┐
    │                   │
Available          Not Available
    │                   │
    ↓                   ↓
Auto-approve?      Reject request
    │              Show error
    ↓
YES → Auto-approve
NO  → Route to FP&A
```

---

## Quick Start - Visual Testing

### Open the test interface:
```
http://localhost:3000/test-budget-check.html
```

### Step 1: Get Customer ID
Click **"Get Customer ID from Seed"** button

### Step 2: Check Budget
Fill in:
- Department (e.g., Engineering)
- Sub-Category (e.g., Software) - optional
- Fiscal Period (e.g., FY2025)
- Amount (e.g., 5000)
- Currency (USD or GBP)

Click **"Check Budget"** button

### Step 3: Try Quick Scenarios
Click any scenario button:
- **Small Request ($2,000)** - Should auto-approve
- **Large Request ($15,000)** - Requires manual approval
- **Excessive Request ($500,000)** - Should reject
- **Currency Conversion** - Tests GBP/USD conversion

---

## API Reference

### Endpoint
```
POST /api/budget/check
```

### Request Body
```json
{
  "customerId": "cust_123",      // Optional - uses first customer if omitted
  "department": "Engineering",    // Required
  "subCategory": "Software",      // Optional
  "fiscalPeriod": "FY2025",      // Required
  "amount": 5000,                 // Required
  "currency": "USD"               // Optional - default USD
}
```

### Response (Budget Available)
```json
{
  "success": true,
  "available": true,
  "budget": {
    "id": "bud_123",
    "budgetedAmount": 500000,
    "committed": 200000,
    "reserved": 50000,
    "available": 240000
  },
  "requestedAmount": 5000,
  "currency": "USD",
  "pendingRequests": 2,
  "pendingAmount": 10000,
  "utilizationPercent": 50,
  "canAutoApprove": true,
  "autoApprovalThreshold": 10000,
  "reason": "Budget available. Will be auto-approved."
}
```

### Response (Budget Not Available)
```json
{
  "success": true,
  "available": false,
  "reason": "Insufficient budget. Available: $5,000, Requested: $15,000. Please contact FP&A team.",
  "details": {
    "searchedFor": {
      "department": "Engineering",
      "subCategory": "Software",
      "fiscalPeriod": "FY2025"
    },
    "availableBudgets": [...]
  }
}
```

---

## Auto-Approval Rules

The API automatically decides if a request should be auto-approved based on:

### 1. Budget Availability
```
Available = Budgeted - Committed - Reserved - Pending(48h)
```

If `Available < Requested Amount` → **REJECT**

### 2. Department Thresholds

| Department  | Auto-Approval Threshold |
|------------|------------------------|
| Engineering | $10,000               |
| Sales       | $5,000                |
| Marketing   | $7,500                |
| Finance     | $3,000                |
| HR          | $5,000                |
| Others      | $5,000 (default)      |

If `Requested Amount > Threshold` → **PENDING (requires FP&A approval)**

### 3. Budget Health

If `Utilization ≥ 90%` → **PENDING (budget critical)**

### 4. All Checks Pass

→ **AUTO-APPROVED** ✓

---

## Testing with cURL

### 1. Get Customer ID
```bash
CUSTOMER_ID=$(curl -s http://localhost:3000/api/seed | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Customer ID: $CUSTOMER_ID"
```

### 2. Test Small Request (Should Auto-Approve)
```bash
curl -X POST http://localhost:3000/api/budget/check \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"department\": \"Engineering\",
    \"fiscalPeriod\": \"FY2025\",
    \"amount\": 2000
  }"
```

### 3. Test Large Request (Should Require Approval)
```bash
curl -X POST http://localhost:3000/api/budget/check \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"department\": \"Engineering\",
    \"fiscalPeriod\": \"FY2025\",
    \"amount\": 15000
  }"
```

### 4. Test Excessive Request (Should Reject)
```bash
curl -X POST http://localhost:3000/api/budget/check \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"department\": \"Engineering\",
    \"fiscalPeriod\": \"FY2025\",
    \"amount\": 500000
  }"
```

---

## Multiple Budgets Scenario

### What happens when multiple budgets match?

The API finds the **first matching budget** based on:
1. Customer ID
2. Department
3. Sub-Category (if provided)
4. Fiscal Period

### Example: Multiple Engineering Budgets

**Budgets in Database:**
```
Engineering > Software > FY2025 = $500k
Engineering > Hardware > FY2025 = $200k
Engineering > null > FY2025 = $100k
```

**Request with subCategory:**
```json
{
  "department": "Engineering",
  "subCategory": "Software",
  "fiscalPeriod": "FY2025",
  "amount": 5000
}
```
→ Matches: `Engineering > Software > FY2025`

**Request without subCategory:**
```json
{
  "department": "Engineering",
  "fiscalPeriod": "FY2025",
  "amount": 5000
}
```
→ Matches: `Engineering > null > FY2025` (exact match for null subcategory)

**No Match Found:**
If no budget matches, API returns `available: false` with list of available budgets for that department.

---

## Common Test Scenarios

### Scenario 1: Small Purchase (Auto-Approve)
```json
{
  "department": "Sales",
  "fiscalPeriod": "FY2025",
  "amount": 2000
}
```
**Expected:** `available: true`, `canAutoApprove: true`

### Scenario 2: Large Purchase (Manual Approval)
```json
{
  "department": "Finance",
  "fiscalPeriod": "FY2025",
  "amount": 5000
}
```
**Expected:** `available: true`, `canAutoApprove: false` (exceeds $3k threshold)

### Scenario 3: Budget Critical (Manual Approval)
Assume budget has 92% utilization
```json
{
  "department": "Engineering",
  "fiscalPeriod": "FY2025",
  "amount": 2000
}
```
**Expected:** `available: true`, `canAutoApprove: false` (budget critical)

### Scenario 4: Insufficient Budget (Reject)
```json
{
  "department": "Engineering",
  "fiscalPeriod": "FY2025",
  "amount": 1000000
}
```
**Expected:** `available: false`

### Scenario 5: Currency Conversion
```json
{
  "department": "Engineering",
  "fiscalPeriod": "FY2025",
  "amount": 2000,
  "currency": "GBP"
}
```
**Expected:** Converts GBP to USD (×1.27) before checking

### Scenario 6: Pending Requests Impact
Assume $10k in pending requests from last 48 hours
```json
{
  "department": "Engineering",
  "fiscalPeriod": "FY2025",
  "amount": 5000
}
```
**Expected:** Available amount reduced by $10k pending amount

---

## Workflow Integration Examples

### Example 1: Purchase Request Workflow
```javascript
// Step 1: User submits purchase request
const purchaseRequest = {
  supplier: "AWS",
  description: "Cloud infrastructure",
  amount: 8000,
  department: "Engineering",
  fiscalPeriod: "FY2025"
};

// Step 2: Check budget before creating request
const budgetCheck = await fetch('/api/budget/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerId: user.customerId,
    department: purchaseRequest.department,
    fiscalPeriod: purchaseRequest.fiscalPeriod,
    amount: purchaseRequest.amount
  })
});

const result = await budgetCheck.json();

// Step 3: Handle result
if (!result.available) {
  // Reject immediately
  return {
    status: 'rejected',
    reason: result.reason
  };
}

if (result.canAutoApprove) {
  // Auto-approve and reserve budget
  return {
    status: 'auto_approved',
    reason: 'Budget available and within threshold'
  };
}

// Requires manual approval
return {
  status: 'pending',
  reason: result.reason,
  requiresApprovalFrom: 'FP&A'
};
```

### Example 2: Pre-Purchase Validation
```javascript
// Real-time budget check in UI
async function validatePurchaseAmount(amount) {
  const result = await checkBudget({
    department: selectedDepartment,
    fiscalPeriod: currentFiscalPeriod,
    amount: amount
  });

  if (!result.available) {
    showError(`Budget not available. ${result.reason}`);
    return false;
  }

  if (!result.canAutoApprove) {
    showWarning(`This will require FP&A approval. ${result.reason}`);
  }

  return true;
}
```

---

## Troubleshooting

### "No budget found for this department/category"
**Cause:** Budget doesn't exist for the specified criteria

**Fix:**
1. Check what budgets exist: `GET /api/budgets?customerId=XXX`
2. Try without subCategory
3. Import budgets first if none exist

### "Insufficient budget"
**Cause:** Not enough available budget

**Details:** Response includes:
- `available`: Current available amount
- `pendingAmount`: Amount in pending requests
- `utilizationPercent`: Current budget usage

**Fix:**
1. Reduce request amount
2. Wait for pending requests to complete
3. Contact FP&A to adjust budget

### Currency conversion not working
**Cause:** Only USD ↔ GBP conversion is implemented

**Fix:** For other currencies, convert to USD before calling API

### Auto-approval threshold wrong
**Cause:** Threshold is hardcoded per department in `lib/approval/engine.ts`

**Fix:** Update `AUTO_APPROVAL_THRESHOLDS` in approval engine

---

## Related Files

- **API Implementation:** `app/api/budget/check/route.ts`
- **Approval Engine:** `lib/approval/engine.ts`
- **Test Interface:** `public/test-budget-check.html`
- **E2E Tests:** `tests/e2e/approval-engine.spec.ts`
- **Alternative API:** `app/api/budgets/check/route.ts` (simpler version)

---

## Summary

The Budget Check API provides:
- ✅ Real-time budget availability check
- ✅ Auto-approval eligibility determination
- ✅ Pending requests consideration
- ✅ Currency conversion support
- ✅ Department-specific thresholds
- ✅ Budget health monitoring
- ✅ Detailed reason explanations

Perfect for workflow integrations that need to validate budget before creating purchase requests.
