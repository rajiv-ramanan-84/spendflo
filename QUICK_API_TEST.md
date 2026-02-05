# Quick API Testing Guide

## Step 1: Get the Correct Customer ID

Open this in your browser:
```
http://localhost:3000/api/seed
```

Copy the **customer id** from the JSON response. It looks like:
```json
{
  "customer": {
    "id": "cml680l8r00003hfxe5j1woyt",  ← Copy this
    "name": "Acme Corporation"
  }
}
```

---

## Step 2: Import Some Data

### Option A: Use FPA Import (Visual)
```
http://localhost:3000/fpa/import

1. Click "Upload Excel"
2. Select: test-data/1_standard_format.csv
3. Review mappings
4. Click "Confirm Mappings"
5. Click "Import"
```

### Option B: Use Quick Upload
```
http://localhost:3000/test-sync.html

1. Paste your customer ID
2. Upload test-data/1_standard_format.csv
3. Click "Upload & Sync"
```

---

## Step 3: Test the APIs

Open the test interface:
```
http://localhost:3000/test-import.html
```

### Use the customer ID you copied in Step 1:

1. **Paste Customer ID** (e.g., `cml680l8r00003hfxe5j1woyt`)
2. **Click "Load Import History"**
   - You should now see your recent import
3. **Click "Use This"** on your import
4. **Click "Test Budget List API"**
   - See ONLY budgets from that import
5. **Click "Before/After Comparison"**
   - See what was added vs what existed before

---

## Alternative: Test with cURL

```bash
# 1. Get customer ID
CUSTOMER_ID=$(curl -s http://localhost:3000/api/seed | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Customer ID: $CUSTOMER_ID"

# 2. Get latest import ID
IMPORT_ID=$(curl -s "http://localhost:3000/api/imports/history?customerId=$CUSTOMER_ID" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Import ID: $IMPORT_ID"

# 3. Test Budget List API (filtered to this import only)
curl -s "http://localhost:3000/api/budgets?customerId=$CUSTOMER_ID&importId=$IMPORT_ID"

# 4. Test Dashboard Stats (filtered to this import only)
curl -s "http://localhost:3000/api/dashboard/stats?customerId=$CUSTOMER_ID&importId=$IMPORT_ID"
```

---

## Common Issues & Fixes

### "No import history found"
- **Cause:** Wrong customer ID or no imports yet
- **Fix:** Get correct customer ID from `/api/seed` or do an import first

### "Cannot read properties of undefined"
- **Cause:** API returned unexpected format (now fixed)
- **Fix:** Refresh the page

### "userId is required"
- **Cause:** Old API validation (now fixed)
- **Fix:** Page now works without userId for file analysis

---

## All Available API Endpoints

### Budget APIs

```bash
# Get all budgets for customer
GET /api/budgets?customerId=XXX

# Get budgets from specific import only
GET /api/budgets?customerId=XXX&importId=YYY

# Get budgets by source
GET /api/budgets?customerId=XXX&source=excel
```

### Dashboard Stats

```bash
# Get all stats
GET /api/dashboard/stats?customerId=XXX

# Get stats for specific import only
GET /api/dashboard/stats?customerId=XXX&importId=YYY
```

### Import APIs

```bash
# Get import history
GET /api/imports/history?customerId=XXX

# Upload file
POST /api/sync/upload
  FormData: file, customerId

# Trigger sync
POST /api/sync/direct
  JSON: { customerId: "XXX" }
```

---

## Quick Test (Copy & Paste to Terminal)

```bash
# Complete end-to-end test
echo "=== Step 1: Get Customer ID ==="
CUSTOMER_ID=$(curl -s http://localhost:3000/api/seed | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Customer ID: $CUSTOMER_ID"

echo -e "\n=== Step 2: Upload File ==="
curl -X POST http://localhost:3000/api/sync/upload \
  -F "file=@test-data/1_standard_format.csv" \
  -F "customerId=$CUSTOMER_ID"

echo -e "\n=== Step 3: Trigger Sync ==="
curl -X POST http://localhost:3000/api/sync/direct \
  -H "Content-Type: application/json" \
  -d "{\"customerId\": \"$CUSTOMER_ID\"}"

echo -e "\n=== Step 4: Get Import History ==="
IMPORT_ID=$(curl -s "http://localhost:3000/api/imports/history?customerId=$CUSTOMER_ID" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Import ID: $IMPORT_ID"

echo -e "\n=== Step 5: Test API (filtered by import) ==="
curl -s "http://localhost:3000/api/budgets?customerId=$CUSTOMER_ID&importId=$IMPORT_ID" | head -100

echo -e "\n=== Done! ==="
```

---

## Visual Test (Easiest)

**Just open this page:**
```
http://localhost:3000/test-import.html
```

1. Paste customer ID from `/api/seed`
2. Click buttons
3. See results

That's it!
