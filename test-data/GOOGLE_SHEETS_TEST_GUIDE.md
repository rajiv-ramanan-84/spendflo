# Google Sheets AI Mapping Test Guide

I've created 3 realistic budget files with **different column names** to thoroughly test the AI mapping capabilities. Each mimics a different enterprise system export.

## Test Files

### 1. `anaplan-budget-export.csv` - Anaplan Style
**Column Mapping Challenge:**
- `Cost Center` → Should map to `department`
- `Category` → Should map to `subCategory`
- `Time Period` → Should map to `fiscalPeriod`
- `Allocated Budget` → Should map to `budgetedAmount`
- `Currency Code` → Should map to `currency`
- Extra columns: Budget Owner, Status, Last Updated, Notes (should be ignored)

**Data:** 24 budget entries across 8 departments (Engineering, Sales, Marketing, Finance, HR, Operations, Product, Customer Success, Legal)

---

### 2. `sap-budget-extract.csv` - SAP/Oracle Style
**Column Mapping Challenge:**
- `Org Unit` → Should map to `department`
- `Expense Type` → Should map to `subCategory`
- `Fiscal Year` → Should map to `fiscalPeriod`
- `Plan Amount` → Should map to `budgetedAmount`
- `Curr` → Should map to `currency`
- Extra columns: Responsible Person, Approval Status, Variance %, Comments (should be ignored)

**Data:** 28 budget entries with org unit codes (ENG-001, SALES-001, etc.)

---

### 3. `finance-team-budget.csv` - Messy Real-World Style
**Column Mapping Challenge (HARDEST):**
- `Business Unit` → Should map to `department`
- `What We're Spending On` → Should map to `subCategory`
- `When` → Should map to `fiscalPeriod`
- `How Much ($)` → Should map to `budgetedAmount`
- `Money Type` → Should map to `currency` (contains "US Dollar" not "USD")
- Extra columns: Who's In Charge, Is This Final?, Tracking Code (should be ignored)

**Data:** 29 budget entries with casual language and varied formats

**Special Challenges:**
- Fiscal period has formats like "Full Year 2025", "Jan-Mar 2025", "Apr-Jun 2025"
- Currency says "US Dollar" instead of "USD"
- Column names are conversational ("What We're Spending On", "How Much ($)")

---

## How to Upload to Google Sheets

### Option 1: Direct Upload
1. Go to [Google Sheets](https://sheets.google.com/)
2. Click **File** → **Import**
3. Click **Upload** tab
4. Drag and drop one of the CSV files
5. Choose:
   - Import location: **Create new spreadsheet**
   - Separator type: **Comma**
   - Convert text to numbers: **Yes**
6. Click **Import data**

### Option 2: Copy-Paste
1. Open the CSV file in a text editor or Excel
2. Select all content (Ctrl+A / Cmd+A)
3. Copy (Ctrl+C / Cmd+C)
4. Create a new Google Sheet
5. Click cell A1
6. Paste (Ctrl+V / Cmd+V)
7. Data should populate into columns

---

## Testing the AI Mapping

### Test 1: Easy Mapping (Anaplan Export)
1. Upload `anaplan-budget-export.csv` to Google Sheets
2. Go to `/fpa/google-sheets` in the app
3. Connect your Google account (if not connected)
4. Select the spreadsheet you just created
5. Select "Sheet1" (or whatever it's named)
6. **Expected AI Mapping:**
   - ✅ Cost Center → department (confidence: ~95%)
   - ✅ Category → subCategory (confidence: ~90%)
   - ✅ Time Period → fiscalPeriod (confidence: ~90%)
   - ✅ Allocated Budget → budgetedAmount (confidence: ~95%)
   - ✅ Currency Code → currency (confidence: ~100%)
   - ❌ Budget Owner → (unmapped)
   - ❌ Status → (unmapped)
   - ❌ Last Updated → (unmapped)
   - ❌ Notes → (unmapped)
7. Review the AI suggestions and confidence scores
8. Click **Import Budgets**
9. Verify 24 budgets imported successfully

---

### Test 2: Medium Difficulty (SAP Extract)
1. Upload `sap-budget-extract.csv` to Google Sheets
2. Follow same steps as Test 1
3. **Expected AI Mapping:**
   - ✅ Org Unit → department (confidence: ~80%)
   - ✅ Expense Type → subCategory (confidence: ~85%)
   - ✅ Fiscal Year → fiscalPeriod (confidence: ~95%)
   - ✅ Plan Amount → budgetedAmount (confidence: ~90%)
   - ✅ Curr → currency (confidence: ~95%)
   - ❌ Responsible Person → (unmapped)
   - ❌ Approval Status → (unmapped)
   - ❌ Variance % → (unmapped)
   - ❌ Comments → (unmapped)
4. Verify 28 budgets imported successfully

**Note:** Org Unit values like "ENG-001" should be cleaned to "ENG-001" as the department name. The AI should handle this.

---

### Test 3: Hard Mode (Messy Finance Data)
1. Upload `finance-team-budget.csv` to Google Sheets
2. Follow same steps as Test 1
3. **Expected AI Mapping (This tests the AI's intelligence!):**
   - ✅ Business Unit → department (confidence: ~75-85%)
   - ✅ What We're Spending On → subCategory (confidence: ~70-80%)
   - ✅ When → fiscalPeriod (confidence: ~70-85%)
   - ✅ How Much ($) → budgetedAmount (confidence: ~80-90%)
   - ⚠️ Money Type → currency (confidence: ~60-75%, may struggle with "US Dollar" vs "USD")
4. Check if AI detects these challenges:
   - Fiscal period variations ("Full Year 2025" vs "Jan-Mar 2025")
   - Currency conversion needed ("US Dollar" → "USD")
   - Casual column names

**Expected Result:**
- Should successfully map all required columns
- May show warnings about currency format needing normalization
- Should import 29 budgets

---

## What to Look For

### ✅ Good AI Mapping Indicators
- **High confidence scores** (>80%) for required fields
- **Clear reasoning** in the mapping explanation
- **Sample data** shown for verification
- **Unmapped columns** correctly identified as non-essential
- **No missing required fields**

### ⚠️ Areas to Test
- **Column name variations** (e.g., "Dept" vs "Department")
- **Data format handling** (e.g., "$50,000" vs "50000")
- **Currency detection** (e.g., "USD" vs "US Dollar" vs "$")
- **Fiscal period parsing** (e.g., "FY2025" vs "2025" vs "Full Year 2025")
- **Extra columns** should be ignored gracefully

### ❌ Potential Issues to Report
- Required column not detected (should not happen with these files)
- Incorrect mapping with high confidence
- Crash or error during mapping
- Unable to import after mapping confirmed

---

## Expected Import Results

After importing each file, you should see:

### Anaplan Export (24 budgets)
- **Departments:** Engineering, Sales, Marketing, Finance, HR, Operations, Product, Customer Success, Legal
- **Periods:** FY2025, Q1-2025, Q2-2025
- **Total Budget:** ~$4,310,000

### SAP Extract (28 budgets)
- **Departments:** Various org units (ENG-001, SALES-001, MKT-001, etc.)
- **Periods:** 2025, 2025-Q1, 2025-Q2
- **Total Budget:** ~$4,588,000

### Finance Team (29 budgets)
- **Departments:** Engineering Team, Sales & Marketing, Marketing Only, Finance Department, etc.
- **Periods:** Full Year 2025, Jan-Mar 2025, Apr-Jun 2025
- **Total Budget:** ~$4,465,000

---

## Troubleshooting

**"Failed to read sheet"**
- Make sure you uploaded the CSV correctly
- Check that the sheet has data (not empty)
- Verify sheet name matches what you selected

**"Missing required fields"**
- This shouldn't happen with these test files
- If it does, it's a bug - the AI should detect all required columns

**"Import failed with errors"**
- Check the error details
- Verify data format in the Google Sheet
- Look for any corrupted rows

**Currency conversion issues**
- If "US Dollar" doesn't convert to "USD", that's a known issue
- You can manually edit the Google Sheet to say "USD" instead

---

## Advanced Testing

### Test Edge Cases
1. **Empty rows** - Add empty rows in the middle of data
2. **Missing values** - Remove some budget amounts
3. **Invalid formats** - Change some numbers to text
4. **Special characters** - Add emojis or special chars to department names
5. **Very large numbers** - Test with billions instead of thousands

### Test Performance
1. **Large dataset** - Duplicate rows to test 100+ budgets
2. **Many columns** - Add 20+ extra columns
3. **Multiple sheets** - Create a workbook with 10 sheets

---

## Success Criteria

✅ **AI Mapping Works Well:**
- All required columns detected automatically
- Confidence scores make sense
- Sample data helps verify correctness
- Extra columns ignored properly

✅ **Import Succeeds:**
- All budgets imported without errors
- Data matches source file
- Audit trail shows import history

✅ **User Experience:**
- Clear step-by-step wizard
- Helpful error messages
- Fast response times
- No crashes or freezes

---

## Files Location

All test files are in:
```
/test-data/
├── anaplan-budget-export.csv      (Easy - standard naming)
├── sap-budget-extract.csv          (Medium - abbreviated names)
└── finance-team-budget.csv         (Hard - casual/messy names)
```

Choose the file that best matches your testing needs, or use all three to thoroughly test the AI mapping engine!
