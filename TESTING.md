# Budget Sync Testing Guide

## Quick Start - Simple Test Interface

Open this URL in your browser:
```
http://localhost:3000/test-sync.html
```

This gives you a simple interface with 3 steps:
1. **Upload File** - Select your CSV/Excel file and upload
2. **Trigger Sync** - Click to sync the uploaded file to database
3. **View Budgets** - See the imported budgets

No React/Next.js complexity - just simple HTML + JavaScript.

---

## API Endpoints for Testing

### 1. Upload File
```bash
curl -X POST http://localhost:3000/api/sync/upload \
  -F "file=@test-data/1_standard_format.csv" \
  -F "customerId=test_customer_123"
```

**Response:**
```json
{
  "success": true,
  "fileName": "test_customer_123_1234567890_file.csv",
  "filePath": "/tmp/spendflo-budget-imports/...",
  "fileSize": 1234
}
```

---

### 2. Trigger Direct Sync
```bash
curl -X POST http://localhost:3000/api/sync/direct \
  -H "Content-Type: application/json" \
  -d '{"customerId": "test_customer_123"}'
```

**Response:**
```json
{
  "success": true,
  "syncId": "sync_1234567890_test_customer_123",
  "status": "success",
  "stats": {
    "totalRows": 5,
    "created": 5,
    "updated": 0,
    "errors": 0
  },
  "duration": "2.44s"
}
```

---

### 3. View Imported Budgets
```bash
curl http://localhost:3000/api/budgets?customerId=test_customer_123
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "budgets": [
    {
      "id": "...",
      "department": "Engineering",
      "subCategory": "Software",
      "fiscalPeriod": "FY2025",
      "budgetedAmount": 500000,
      "currency": "USD",
      "source": "upload",
      "createdAt": "2026-02-05T08:26:14.729Z"
    }
  ]
}
```

---

### 4. Debug Info
```bash
curl http://localhost:3000/api/sync/debug?customerId=test_customer_123
```

Shows files in upload directory and system info.

---

## Test Files Available

Located in `test-data/` directory:

1. `1_standard_format.csv` - Standard budget format
2. `2_abbreviated_format.csv` - Short column names
3. `3_anaplan_style.csv` - Anaplan export format
4. `4_prophix_style.csv` - Prophix export format
5. `5_multi_currency.csv` - Multiple currencies
6. `6_with_typos.csv` - Tests fuzzy matching
7. `7_minimal_required_only.csv` - Just required fields
8. `8_quarterly_budget.csv` - Quarterly periods
9. `9_large_dataset.csv` - 48 rows
10. `10_with_currency_symbols.csv` - Currency symbols

---

## Complete Flow Example

```bash
# 1. Upload file
curl -X POST http://localhost:3000/api/sync/upload \
  -F "file=@test-data/1_standard_format.csv" \
  -F "customerId=test_customer_123"

# 2. Sync to database
curl -X POST http://localhost:3000/api/sync/direct \
  -H "Content-Type: application/json" \
  -d '{"customerId": "test_customer_123"}'

# 3. View results
curl http://localhost:3000/api/budgets?customerId=test_customer_123
```

---

## Troubleshooting

### "Customer not found" error
Create the customer first:
```bash
node create-test-customer.js
```

### View server logs
```bash
tail -f /tmp/next-dev.log
```

### Check uploaded files
```bash
ls -lh /tmp/spendflo-budget-imports/
```

### Verify imported data
```bash
node verify-import.js
```

---

## All Available APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sync/upload` | POST | Upload budget file |
| `/api/sync/direct` | POST | Trigger sync immediately |
| `/api/sync/debug` | GET | Debug info about files |
| `/api/budgets` | GET | View imported budgets |
| `/api/sync/config` | POST | Create sync configuration (for automated syncs) |
| `/api/sync/trigger` | POST | Trigger configured sync (for automated syncs) |
| `/api/sync/history` | GET | View sync history |

---

## Simple Test Script

You can also use the JavaScript test we created:

```bash
node test-direct-sync.js
```

This will:
- Check if files exist
- Call the direct sync API
- Show detailed error messages if anything fails
