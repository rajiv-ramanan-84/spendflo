# Existing Budget Import Features

## Visual Mapping Interface ✅ ALREADY BUILT

Located at: `http://localhost:3000/fpa/import`

### Features:

#### 1. **Two Import Modes**
- **Excel Upload** - Upload CSV/XLSX files
- **Google Sheets** - Connect and import from Google Sheets

#### 2. **AI-Powered Column Mapping**
- Automatically detects columns using fuzzy matching
- Shows confidence scores (e.g., "AI 95%")
- Suggests mappings based on column names + sample data
- Handles typos and abbreviations (e.g., "Dept" → "Department")

#### 3. **Visual Mapping Interface**
```
Review Mode (Step 1):
┌─────────────────────────────────────────────┐
│ Source Column    →    Target Field          │
│ ─────────────────────────────────────────── │
│ "Dept Name"      →    Department       95%  │
│ "Budget Amt"     →    Budgeted Amount  92%  │
│ "FY Period"      →    Fiscal Period    88%  │
│ "Sub Cat"        →    Sub Category     85%  │
│ "Currency Code"  →    Currency         67%  │
└─────────────────────────────────────────────┘

Edit Mode (Step 2):
- Dropdown to override AI suggestions
- Show sample values from each column
- Mark required vs optional fields
- Prevent duplicate mappings
```

#### 4. **Data Preview**
- Shows first 5 rows of data
- Sample values displayed under each column
- Visual indicators for mapped/unmapped columns

#### 5. **Validation**
- Checks for required fields (Department, Fiscal Period, Amount)
- Shows warnings for unmapped columns
- Validates data before import

#### 6. **Import History**
- Tracks all imports
- Success/failure counts
- Error details per row
- Activity logs

---

## APIs Already Built ✅

### 1. `/api/imports/ai-map` (POST)
**Purpose:** Upload file, get AI mapping suggestions

**Request:**
```bash
curl -X POST http://localhost:3000/api/imports/ai-map \
  -F "file=@budget.xlsx"
```

**Response:**
```json
{
  "success": true,
  "file": {
    "name": "budget.xlsx",
    "totalRows": 100,
    "totalColumns": 6
  },
  "mappings": [
    {
      "sourceColumn": "Dept Name",
      "targetField": "department",
      "confidence": 0.95,
      "reason": "High similarity + sample data matches",
      "sampleValues": ["Engineering", "Sales", "Marketing"]
    }
  ],
  "unmappedColumns": ["Extra Column"],
  "requiredFieldsMissing": [],
  "canProceed": true
}
```

---

### 2. `/api/imports/execute` (POST)
**Purpose:** Execute import with confirmed mappings

**Request:**
```bash
curl -X POST http://localhost:3000/api/imports/execute \
  -F "file=@budget.xlsx" \
  -F "customerId=test_customer_123" \
  -F "createdById=user123" \
  -F 'mappings=[{"sourceColumn":"Dept Name","targetField":"department"}]'
```

**Response:**
```json
{
  "success": true,
  "importId": "imp_123",
  "totalRows": 100,
  "successCount": 98,
  "failureCount": 2,
  "errors": [
    {"row": 15, "error": "Invalid amount"}
  ]
}
```

---

### 3. `/api/imports/history` (GET)
**Purpose:** View import history

```bash
curl http://localhost:3000/api/imports/history?customerId=test_customer_123
```

---

## Database Models ✅

Already in Prisma schema:

### ImportMapping
- Stores saved mappings for reuse
- AI confidence scores
- Created by user
- Last used timestamp

### ImportHistory
- Tracks all imports
- Status (pending, processing, completed, failed)
- Success/failure counts
- Error details
- Source type

---

## What's Missing for Onboarding Team?

### 1. Save Mapping as Template ❌
**Gap:** Can't save mappings for reuse

**Need to add:**
- "Save as Template" button after mapping
- Name the template (e.g., "Acme Corp - Monthly Budget")
- Associate with customer
- Load saved mapping for next import

### 2. Mapping Template Management ❌
**Gap:** No way to list/edit/delete saved mappings

**Need to add:**
- `/admin/mappings` page
- List all saved templates
- Edit existing mappings
- Clone for similar customers
- Version history

### 3. Customer Template Generator ❌
**Gap:** No way to give customer correct file format

**Need to add:**
- Download Excel template button
- Pre-fills correct column headers
- Includes sample data
- Validation rules embedded

### 4. Approval Workflow ❌
**Gap:** No approval step before import

**Need to add:**
- Implementation manager submits mapping
- FPA admin reviews/approves
- Audit trail

### 5. Onboarding Wizard ❌
**Gap:** Existing UI is for FPA team, not onboarding

**Need to add:**
- Simplified wizard for onboarding team
- Customer setup step
- File upload + mapping
- Test import (preview only)
- Go live

---

## Recommended: Adapt for Onboarding

Create `/admin/onboarding` that **reuses existing components**:

```
Step 1: Customer Info
- Enter customer name, ID
- Select file source (Excel, Google Sheets, SFTP, S3)

Step 2: Upload Sample File
- Reuse existing upload logic from /fpa/import

Step 3: Review AI Mappings
- Reuse existing visual mapper from /fpa/import
- Add "Save as Template" button

Step 4: Test Import (Preview Only)
- Show what will be imported (don't commit)
- Validation warnings

Step 5: Go Live
- Approve and activate
- Schedule sync (if automated)
```

---

## Summary

**What exists:**
✅ Visual mapper UI with AI suggestions
✅ Review & edit modes
✅ File upload (Excel, CSV, Google Sheets)
✅ Import execution
✅ History tracking
✅ APIs for everything

**What's missing:**
❌ Save mapping as template
❌ Template management UI
❌ Customer template generator
❌ Onboarding wizard wrapper
❌ Approval workflow

**Recommendation:**
**Reuse 90% of existing `/fpa/import` code**, just add:
1. "Save Mapping" button
2. Template management page
3. Onboarding wizard wrapper
