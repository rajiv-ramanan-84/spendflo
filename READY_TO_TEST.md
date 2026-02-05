# Ready to Test - Complete Guide

## What's Ready Now

### ✅ Visual Mapper (Already Built)
Location: `http://localhost:3000/fpa/import`
- Upload Excel/CSV files
- Connect Google Sheets
- AI column mapping with confidence scores
- Review and edit mappings
- Import to database

### ✅ Budget Dashboard (Connected to Database)
Location: `http://localhost:3000/dashboard?customerId=<customer_id>`
- Shows all imported budgets
- Budget statistics
- Utilization tracking

### ✅ Import-Specific API Testing (NEW!)
Location: `http://localhost:3000/test-import.html`
- Test APIs with ONLY data from a specific import
- Before/After comparison
- Verify what was imported

### ✅ Simple Upload Testing
Location: `http://localhost:3000/test-sync.html`
- Quick file upload interface
- Direct sync trigger
- View results

---

## Test Scenarios (As Onboarding Manager)

### Scenario 1: Manual Upload (Excel/CSV)

**What You'll Do:**
1. Get sample export from customer (Anaplan, Prophix, etc.)
2. Upload to mapper
3. Review AI mappings
4. Confirm mappings
5. Import to database

**How to Test:**

```bash
# Step 1: Open mapper
http://localhost:3000/fpa/import

# Step 2: Upload sample file
- Click "Upload Excel"
- Select file from test-data/ folder
- Wait for AI analysis

# Step 3: Review mappings
- See confidence scores
- Override if needed
- Click "Confirm Mappings"

# Step 4: Import
- Click "Import" button
- Wait for completion

# Step 5: Verify in dashboard
http://localhost:3000/dashboard?customerId=test_customer_123
```

**Test with Import-Specific Data:**
```bash
# Go to test interface
http://localhost:3000/test-import.html

# Steps:
1. Enter customer ID
2. Click "Load Import History"
3. Select the import you just did
4. Click "Test Budget List API"
5. See ONLY the budgets you just imported (not mixed with old data)
```

---

### Scenario 2: Google Sheets

**What You'll Do:**
1. Get customer's Google Sheet link
2. Connect your onboarding account
3. Select their spreadsheet
4. Map columns
5. Set up auto-sync schedule

**How to Test:**

```bash
# Step 1: Open mapper
http://localhost:3000/fpa/import

# Step 2: Connect Google Sheets
- Click "Google Sheets" tab
- Click "Connect Google Account"
- Sign in and grant permissions

# Step 3: Select spreadsheet
- Search for customer's sheet
- Select sheet tab
- Click "Analyze"

# Step 4: Review & confirm mappings
- Same as manual upload flow

# Step 5: Set schedule
- Configure sync frequency
- Enable auto-sync
```

**Note:** Currently Google Sheets is set up but you need actual Google OAuth credentials. For testing, use manual upload instead.

---

### Scenario 3: SFTP

**What You'll Do:**
1. Set up SFTP location for customer
2. Give customer credentials
3. Upload test file to SFTP
4. Confirm sync reads file

**Current Status:**
- SFTP sync engine is built (`lib/sync/file-receiver.ts`)
- SFTP configuration API exists (`/api/sync/config`)
- SFTP server needs to be set up (not in localhost)

**To Enable SFTP Testing:**
You'll need to set up an actual SFTP server. For now, you can simulate SFTP by:

```bash
# Simulate SFTP by placing file in upload directory
cp test-data/1_standard_format.csv /tmp/spendflo-budget-imports/test_customer_123_budget.csv

# Then trigger sync
curl -X POST http://localhost:3000/api/sync/direct \
  -H "Content-Type: application/json" \
  -d '{"customerId": "test_customer_123"}'
```

---

## Key Testing Interfaces

### 1. Onboarding Mapper
**URL:** `http://localhost:3000/fpa/import`

**Use For:**
- Visual column mapping
- Review AI suggestions
- Import files

**Features:**
- ✅ AI-powered mapping
- ✅ Confidence scores
- ✅ Sample data preview
- ✅ Validation before import
- ❌ Save mapping as template (need to add)
- ❌ Load saved templates (need to add)

---

### 2. Import-Specific Testing
**URL:** `http://localhost:3000/test-import.html`

**Use For:**
- Testing APIs with ONLY your imported data
- Before/After comparison
- Verifying what was imported

**Features:**
- ✅ Select specific import
- ✅ Filter APIs by importId
- ✅ Compare before/after
- ✅ Preview imported data

**Example:**
```javascript
// Test Budget API with ONLY this import's data
GET /api/budgets?customerId=test_customer_123&importId=imp_1234567890

// Returns ONLY budgets from that import, not mixed with old data
```

---

### 3. Budget Dashboard
**URL:** `http://localhost:3000/dashboard?customerId=test_customer_123`

**Use For:**
- Viewing all imported budgets
- Checking totals
- Budget utilization

**Features:**
- ✅ List all budgets
- ✅ Filter by customer
- ✅ Statistics
- ✅ Utilization tracking

**Also Supports Filters:**
```
# Show only budgets from specific import
http://localhost:3000/dashboard?customerId=test_customer_123&importId=imp_xxx

# Show only budgets from specific source
http://localhost:3000/dashboard?customerId=test_customer_123&source=excel
```

---

### 4. Quick Upload Test
**URL:** `http://localhost:3000/test-sync.html`

**Use For:**
- Quick file upload testing
- Direct sync without mapper
- API testing

**Features:**
- ✅ Simple upload interface
- ✅ Direct sync trigger
- ✅ Debug info
- ✅ View results

---

## Complete Test Flow (Step by Step)

### Test 1: Upload and Verify

```bash
# 1. Open upload page
http://localhost:3000/test-sync.html

# 2. Enter customer ID
test_customer_123

# 3. Upload file
Select: test-data/1_standard_format.csv
Click: "Upload File"

# 4. Trigger sync
Click: "Trigger Sync"

# 5. Check results
Should see:
✅ Sync Success!
Total Rows: 15
Created: 15
Errors: 0

# 6. View in dashboard
http://localhost:3000/dashboard?customerId=test_customer_123

Should see 15 budgets
```

---

### Test 2: Mapper with Column Mapping

```bash
# 1. Open mapper
http://localhost:3000/fpa/import

# 2. Upload file
Click "Upload Excel"
Select: test-data/2_abbreviated_format.csv

# 3. Review AI mappings
Should see:
"Dept" → Department (93%)
"FY" → Fiscal Period (88%)
"Amt" → Budgeted Amount (91%)

# 4. Confirm and import
Click "Confirm Mappings"
Click "Import"

# 5. View results
Should see success message
```

---

### Test 3: Import-Specific API Testing

```bash
# 1. Open test interface
http://localhost:3000/test-import.html

# 2. Load import history
Customer ID: test_customer_123
Click "Load Import History"

# 3. Select recent import
Click "Use This" on the most recent import

# 4. Test Budget List API
Click "Test Budget List API"

Should see:
✅ API Test Successful
Returned X budgets
Filtered by importId: imp_...

# 5. Run comparison
Click "Before/After Comparison"

Should see:
Before: Y budgets
This import added: X budgets
After: Y+X budgets
```

---

## API Endpoints Summary

### Budget APIs

**Get All Budgets:**
```bash
GET /api/budgets?customerId=test_customer_123
```

**Get Budgets from Specific Import:**
```bash
GET /api/budgets?customerId=test_customer_123&importId=imp_1234567890
```

**Get Budgets by Source:**
```bash
GET /api/budgets?customerId=test_customer_123&source=excel
```

---

### Dashboard APIs

**Get Dashboard Stats:**
```bash
GET /api/dashboard/stats?customerId=test_customer_123
```

**Get Stats for Specific Import:**
```bash
GET /api/dashboard/stats?customerId=test_customer_123&importId=imp_1234567890
```

---

### Import APIs

**Upload File:**
```bash
POST /api/sync/upload
FormData:
  file: <file>
  customerId: test_customer_123
```

**Direct Sync:**
```bash
POST /api/sync/direct
Body:
  {
    "customerId": "test_customer_123"
  }
```

**Import History:**
```bash
GET /api/imports/history?customerId=test_customer_123
```

---

## What's Missing (Next Steps)

### For Complete Onboarding Flow:

1. **Save Mapping as Template** ❌
   - Add "Save Template" button after mapping
   - Store in ImportMapping table

2. **Load Saved Templates** ❌
   - Dropdown to select saved mapping
   - Auto-apply to file

3. **Customer Template Generator** ❌
   - Download Excel template button
   - Pre-filled with correct headers

4. **SFTP Server Setup** ❌
   - Actual SFTP server (not local)
   - Credentials management

5. **Onboarding Wizard** ❌
   - Step-by-step flow wrapper
   - Customer setup + mapping + testing

---

## Quick Commands

**Create fresh test customer:**
```bash
node create-test-customer.js
```

**View imported data:**
```bash
node verify-import.js
```

**Check database:**
```bash
curl http://localhost:3000/api/budgets?customerId=test_customer_123
```

**Check upload directory:**
```bash
ls -lh /tmp/spendflo-budget-imports/
```

---

## Summary

### What Works Today:
✅ Manual Excel/CSV upload with visual mapper
✅ AI column mapping with confidence scores
✅ Import to database with validation
✅ Dashboard to view imported budgets
✅ Import-specific API testing (filter by importId)
✅ Before/After comparison
✅ Import history tracking

### Test This Now:
1. `http://localhost:3000/fpa/import` - Upload and map file
2. `http://localhost:3000/test-import.html` - Test import-specific APIs
3. `http://localhost:3000/dashboard?customerId=test_customer_123` - View results

### Ready for Onboarding Manager Role:
✅ Upload sample file from customer
✅ Review AI mappings
✅ Confirm mappings
✅ Import to database
✅ Verify with import-specific testing
⚠️ Save mapping as template (need to add)
⚠️ SFTP setup (need external server)
⚠️ Google Sheets (need OAuth setup)
