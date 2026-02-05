# Onboarding Manager Test Flows

## Role: Onboarding Manager
**Goal:** Set up budget sync for a new customer

---

## Flow 1: Google Sheets Source

### Steps:

**1. Get Sample File from Customer**
- Customer shares Google Sheet with budget data
- Example: "Acme Corp Q1 2025 Budget"

**2. Upload & Map Sample File**
```
Go to: http://localhost:3000/admin/onboarding

Step 1: Customer Info
- Enter: Customer ID (e.g., "acme_corp")
- Enter: Customer Name (e.g., "Acme Corporation")
- Select Source: "Google Sheets"
- Click "Next"

Step 2: Connect Google Sheets
- Click "Connect Google Account"
- Sign in with YOUR onboarding manager account
- Grant permissions to access Google Sheets
- Select customer's shared spreadsheet
- Select sheet tab with budget data
- Click "Analyze File"

Step 3: Review AI Column Mappings
- See mapped columns:
  ✅ "Department Name" → Department (95% confidence)
  ✅ "FY" → Fiscal Period (88% confidence)
  ✅ "Budgeted $" → Budgeted Amount (92% confidence)
  ⚠️  "Curr" → Currency (67% confidence)

- Override if needed using dropdowns
- Ensure all required fields mapped
- Click "Confirm Mappings"

Step 4: Save Mapping Template
- Template Name: "Acme Corp - Monthly Budget"
- Description: "Standard format from their Google Sheet"
- Click "Save Template"
```

**3. Set Up Sync Schedule**
```
Step 5: Configure Sync
- Sync Frequency: Every 4 hours (recommended)
- Enable Auto-Sync: Yes
- Click "Save Configuration"
```

**4. Test Import**
```
Step 6: Test Import (Preview Mode)
- Click "Run Test Import"
- Review preview:
  • 5 rows will be imported
  • 0 errors found
  • Validation warnings: None

- See sample data preview:
  Department  | Fiscal Period | Amount    | Currency
  Engineering | FY2025       | 500,000   | USD
  Sales       | FY2025       | 250,000   | USD

- Click "Looks Good"
```

**5. Go Live**
```
Step 7: Activate
- Review summary:
  ✓ Customer: Acme Corporation
  ✓ Source: Google Sheets
  ✓ Mapping: Saved as template
  ✓ Schedule: Every 4 hours
  ✓ Test: Passed

- Click "Activate Sync"
- Success! First sync will run in 4 hours
```

**6. Verify Data**
```
Go to: http://localhost:3000/dashboard?customerId=acme_corp

Should see:
- 5 budgets imported
- Total budget: $1,200,000
- Source: Google Sheets
```

---

## Flow 2: Manual Upload Source

### Steps:

**1. Get Sample File from Customer**
- Customer sends Anaplan export (Excel file)
- File: "Anaplan_Budget_Export_2025.xlsx"

**2. Upload & Map Sample File**
```
Go to: http://localhost:3000/admin/onboarding

Step 1: Customer Info
- Customer ID: "beta_inc"
- Customer Name: "Beta Inc"
- Select Source: "Manual Upload"
- Click "Next"

Step 2: Upload Sample File
- Click "Choose File"
- Select: Anaplan_Budget_Export_2025.xlsx
- Click "Upload & Analyze"

Step 3: Review AI Column Mappings
- AI detects Anaplan format:
  ✅ "Cost Center" → Department (91% confidence)
  ✅ "Period" → Fiscal Period (95% confidence)
  ✅ "Planned Amount" → Budgeted Amount (89% confidence)
  ✅ "Currency Code" → Currency (100% confidence)
  ❌ "Version" → (Unmapped - not needed)

- Click "Confirm Mappings"

Step 4: Save Mapping Template
- Template Name: "Beta Inc - Anaplan Export"
- Description: "Standard Anaplan export format"
- Click "Save Template"
```

**3. Provide Upload Instructions to Customer**
```
Step 5: Generate Upload Instructions
- Click "Generate Customer Guide"
- Download PDF with:
  • Required column headers
  • Excel template
  • Upload link for customer
  • Example data

- Send to customer
```

**4. Test Import**
```
Step 6: Test Import
- Click "Run Test Import"
- Preview shows 15 rows will be imported
- Click "Import to Database"
- Success! 15 budgets imported
```

**5. Verify Data**
```
Go to: http://localhost:3000/dashboard?customerId=beta_inc

Should see 15 budgets from Anaplan export
```

---

## Flow 3: SFTP Source

### Steps:

**1. Get Sample File from Customer**
- Customer will send files via SFTP
- File naming: "budget_YYYYMMDD.csv"

**2. Set Up SFTP Location**
```
Go to: http://localhost:3000/admin/onboarding

Step 1: Customer Info
- Customer ID: "gamma_co"
- Customer Name: "Gamma Company"
- Select Source: "SFTP"
- Click "Next"

Step 2: SFTP Configuration
- SFTP Host: sftp.spendflo.com
- Port: 22
- Directory: /uploads/budgets/gamma_co/
- Click "Generate Credentials"

- SFTP Credentials Created:
  • Username: gamma_co_sftp
  • Password: [auto-generated secure password]
  • Path: /uploads/budgets/gamma_co/

- Click "Copy Credentials" (to send to customer)
```

**3. Upload Sample File to SFTP**
```
Step 3: Test SFTP Connection
- Upload sample file to SFTP:

  # From terminal:
  sftp gamma_co_sftp@sftp.spendflo.com
  cd /uploads/budgets/gamma_co/
  put budget_20250205.csv

- Back in onboarding wizard:
- Click "Check for Files"
- Should detect: budget_20250205.csv (1.2 MB)
- Click "Analyze File"
```

**4. Map Columns**
```
Step 4: Review AI Mappings
- AI analyzes CSV:
  ✅ "Dept" → Department (93% confidence)
  ✅ "FY Period" → Fiscal Period (97% confidence)
  ✅ "Budget" → Budgeted Amount (94% confidence)
  ⚠️  No currency column found

- Manually set:
  Currency = USD (default)

- Click "Confirm Mappings"

Step 5: Save Mapping Template
- Template Name: "Gamma Co - SFTP CSV Format"
- Click "Save Template"
```

**5. Set Up Sync Schedule**
```
Step 6: Configure Sync Schedule
- Poll Frequency: Every 4 hours
- File Pattern: budget_*.csv
- Process After Upload: Immediately
- Delete After Processing: Yes (move to /processed/)
- Click "Save Configuration"
```

**6. Test Full Flow**
```
Step 7: Test SFTP Sync
- Upload test file to SFTP
- Click "Trigger Test Sync"
- Monitor sync:
  • File detected: ✓
  • File downloaded: ✓
  • Parsed: ✓ (20 rows)
  • Mapped: ✓
  • Imported: ✓ (20 budgets created)
  • File moved to /processed/: ✓

- Click "Approve"
```

**7. Go Live**
```
Step 8: Activate
- Sync activated
- Next poll: 4 hours
- Customer credentials sent
```

---

## API Testing: Test with ONLY Your Uploaded Data

### Problem:
You upload a file with 5 rows, but dashboard shows 100 budgets (old + new data mixed).

### Solution: Import-Specific Testing

After importing, go to:
```
http://localhost:3000/admin/onboarding/test?importId=<import_id>
```

### This page shows:

**1. Import Summary**
```
Import ID: imp_1234567890
Customer: Acme Corp
File: budget_2025.csv
Imported: 5 budgets
Status: Completed
Time: 2 minutes ago
```

**2. Test APIs with ONLY This Import's Data**
```
# Test Budget List API (filtered to this import)
GET /api/budgets?customerId=acme_corp&importId=imp_1234567890

Response:
{
  "budgets": [
    // ONLY the 5 budgets from this import
  ]
}

# Test Dashboard Stats API (filtered to this import)
GET /api/dashboard/stats?customerId=acme_corp&importId=imp_1234567890

Response:
{
  "summary": {
    "totalBudget": 1200000,  // Sum of ONLY these 5 budgets
    "totalBudgets": 5        // Count of ONLY these 5 budgets
  }
}
```

**3. Compare Before/After**
```
Before Import:
- Total Budgets: 95
- Total Amount: $10,500,000

After Import (with filter):
- NEW Budgets: 5
- NEW Amount: $1,200,000

After Import (all data):
- Total Budgets: 100
- Total Amount: $11,700,000
```

**4. Row-by-Row Verification**
```
File Row 1 → Database Budget ID: bud_abc123
  Department: Engineering
  Amount: $500,000
  Status: ✓ Created

File Row 2 → Database Budget ID: bud_def456
  Department: Sales
  Amount: $250,000
  Status: ✓ Created

... (all 5 rows)
```

---

## Quick Test Commands

### Test Each Flow:

**1. Google Sheets:**
```bash
# Test Google Sheets auth
curl http://localhost:3000/api/google-sheets/auth?userId=test_user&customerId=test_customer

# Test sheet list
curl http://localhost:3000/api/google-sheets/list?userId=test_user
```

**2. Manual Upload:**
```bash
# Test upload
curl -X POST http://localhost:3000/api/sync/upload \
  -F "file=@test-data/1_standard_format.csv" \
  -F "customerId=test_customer_123"

# Test direct sync
curl -X POST http://localhost:3000/api/sync/direct \
  -H "Content-Type: application/json" \
  -d '{"customerId": "test_customer_123"}'
```

**3. SFTP:**
```bash
# Test SFTP file detection
curl http://localhost:3000/api/sync/debug?customerId=test_customer_123

# Test SFTP sync trigger
curl -X POST http://localhost:3000/api/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{"customerId": "test_customer_123"}'
```

---

## Dashboard Verification

After any import, verify in dashboard:
```
http://localhost:3000/dashboard?customerId=<customer_id>
```

Should show:
- All imported budgets
- Correct totals
- Source attribution (Google Sheets / Manual / SFTP)
- Import timestamp

---

## Troubleshooting

### Dashboard shows no data:
```bash
# Check if budgets exist
curl http://localhost:3000/api/budgets?customerId=test_customer_123

# Check import history
curl http://localhost:3000/api/imports/history?customerId=test_customer_123
```

### Want to test with fresh data:
```bash
# Create new test customer
node create-test-customer.js

# Upload to new customer
curl -X POST http://localhost:3000/api/sync/upload \
  -F "file=@test-data/1_standard_format.csv" \
  -F "customerId=new_test_customer"
```

### SFTP files not being detected:
```bash
# Check SFTP directory
ls -la /tmp/spendflo-budget-imports/

# Check sync config
curl http://localhost:3000/api/sync/config?customerId=test_customer
```
