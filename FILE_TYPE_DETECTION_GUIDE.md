# File Type Detection - User Guide

## Overview

The budget import system now intelligently detects if you're uploading the wrong type of file (like payroll, expenses, or invoices instead of budgets) and **asks for confirmation before proceeding**.

This prevents common mistakes like:
- ❌ Uploading employee payroll data instead of department budgets
- ❌ Uploading expense reports instead of budget allocations
- ❌ Uploading vendor invoices instead of planned budgets

---

## How It Works

When you upload a file, the AI analyzes:

1. **Column Headers** - What the columns are named
2. **Sample Data** - What the actual values look like
3. **Keywords** - Budget vs non-budget terminology

Then it determines:
- **File Type**: budget, payroll, expenses, invoice, or unknown
- **Confidence**: How sure it is (0-100%)
- **Budget Confidence**: How much it looks like a budget file

---

## What Happens During Upload

### ✅ Scenario 1: Valid Budget File

```
Headers: Department, Fiscal Period, Budgeted Amount
Keywords found: department, fiscal, budgeted
```

**Result:** ✓ File uploads normally, no warnings

---

### ⚠️ Scenario 2: Payroll File Detected

```
Headers: Employee Name, Salary, Gross Pay, Net Pay, Deductions
Keywords found: salary, payroll, employee, gross pay, deductions
```

**Result:** You see a confirmation dialog:

```
⚠️ WARNING: This looks like a PAYROLL file, not a budget file!

Confidence: 85%
Detected keywords: salary, payroll, employee, gross pay, deductions

Budget files should contain:
- Department names
- Fiscal periods (FY2025, Q1 2025, etc.)
- Budget amounts

Are you SURE you want to continue with this file?

[Cancel] [Continue Anyway]
```

**Your choices:**
- **Cancel**: File is rejected, you can upload the correct file
- **Continue Anyway**: File proceeds with a warning banner

---

### ⚠️ Scenario 3: Expenses File Detected

```
Headers: Expense ID, Submitted By, Vendor, Receipt, Purchase Date
Keywords found: expense, reimbursement, receipt, vendor, transaction
```

**Result:** Similar confirmation dialog explaining this is expenses, not budgets

---

### ⚠️ Scenario 4: Invoice File Detected

```
Headers: Invoice Number, Supplier, PO Number, Due Date, Amount Due
Keywords found: invoice, supplier, purchase order, due date, payment terms
```

**Result:** Similar confirmation dialog explaining this is invoices, not budgets

---

### ⚠️ Scenario 5: Low Confidence Budget File

```
File appears to be budget, but with unusual column names
Budget Confidence: 25%
```

**Result:** Warning toast message:
```
⚠️ Low Budget Confidence
This file has low confidence of being a budget file (25%).
Please verify carefully.
```

You can still proceed, but suggested to review mappings carefully.

---

## Testing File Type Detection

### Step 1: Test with Correct Budget File

```bash
# Use existing budget file
open http://localhost:3000/fpa/import

# Upload: test-data/1_standard_format.csv
# Expected: ✓ No warnings, proceeds normally
```

### Step 2: Test with Payroll File

```bash
# Upload the payroll sample
open http://localhost:3000/fpa/import

# Upload: test-data/payroll_sample.csv
# Expected: ⚠️ Warning dialog about payroll file
```

**What the payroll file contains:**
```csv
Employee ID, Employee Name, Department, Salary, Gross Pay, Net Pay,
Deductions, Tax, Social Security, Payroll Period
```

**Detection triggers on:**
- "Salary", "Gross Pay", "Net Pay" (payroll keywords)
- "Deductions", "Tax", "Social Security" (payroll keywords)
- "Employee" (not found in budget files)

### Step 3: Test with Expenses File

```bash
# Upload the expenses sample
# Upload: test-data/expenses_sample.csv
# Expected: ⚠️ Warning dialog about expenses file
```

**What the expenses file contains:**
```csv
Expense ID, Submitted By, Vendor, Receipt, Purchase Date,
Expense Report, Approver, Status
```

**Detection triggers on:**
- "Expense", "Receipt", "Vendor" (expense keywords)
- "Submitted By", "Approver" (workflow keywords)

### Step 4: Test with Invoice File

```bash
# Upload the invoice sample
# Upload: test-data/invoice_sample.csv
# Expected: ⚠️ Warning dialog about invoice file
```

**What the invoice file contains:**
```csv
Invoice Number, Supplier, PO Number, Purchase Order,
Due Date, Amount Due, Payment Terms
```

**Detection triggers on:**
- "Invoice", "Supplier", "PO Number" (invoice keywords)
- "Due Date", "Payment Terms" (invoice keywords)

---

## Keyword Detection Reference

### Budget Keywords (GOOD)
```
budget, budgeted, allocated, allocation, fiscal, planned,
forecast, department, cost center, opex, capex, q1, q2, q3, q4, fy
```

### Payroll Keywords (WARNING)
```
salary, payroll, employee, emp, wage, compensation, bonus,
gross pay, net pay, deduction, tax, social security, benefits,
employee id, hourly rate, overtime, timesheet
```

### Expenses Keywords (WARNING)
```
expense, reimbursement, receipt, claim, vendor, merchant,
transaction, card, credit card, purchase date, submitted by,
approver, expense report
```

### Invoice Keywords (WARNING)
```
invoice, bill, po number, purchase order, supplier, vendor,
due date, payment terms, line item, quantity, unit price,
invoice number, invoice date, total due, amount due
```

---

## Advanced: How Confidence Scores Work

### File Type Confidence
```javascript
Confidence = (Keyword Matches) / 5

Examples:
- 5+ keyword matches = 100% confidence
- 3 keyword matches = 60% confidence
- 1 keyword match = 20% confidence
```

### Budget Confidence
```javascript
BudgetConfidence = (Budget Keywords) / max(Non-Budget Keywords, 3)

Examples:
- 6 budget keywords, 0 non-budget = 100% (capped at 100%)
- 3 budget keywords, 1 non-budget = 100%
- 3 budget keywords, 6 non-budget = 50%
- 1 budget keyword, 5 non-budget = 20%
```

### Decision Logic

```
IF file has > 5 payroll keywords:
  → Show payroll warning dialog

ELSE IF file has > 5 expense keywords:
  → Show expense warning dialog

ELSE IF file has > 5 invoice keywords:
  → Show invoice warning dialog

ELSE IF budget confidence < 30%:
  → Show low confidence warning

ELSE:
  → Proceed normally
```

---

## Real-World Examples

### Example 1: HR Upload Mistake

**Scenario:** HR person trying to help with budgets, accidentally uploads payroll spreadsheet

**What they see:**
```
⚠️ WARNING: This looks like a PAYROLL file!
Confidence: 92%
Detected: salary, employee, gross pay, deductions, payroll

Are you SURE you want to continue?
```

**Outcome:** They realize the mistake, cancel, and get the budget file from finance team instead

---

### Example 2: Finance Upload with Mixed Data

**Scenario:** Finance file has both budget AND actual expense data in same file

**What they see:**
```
⚠️ File appears to be a budget file, but also contains 3 non-budget keyword(s).
Please verify this is the correct file.
```

**Outcome:** They can proceed but know to verify the mappings carefully during import

---

### Example 3: Unusual Budget File Format

**Scenario:** Company uses unusual column names like "Allocation Plan" instead of "Budget"

**What they see:**
```
⚠️ Low Budget Confidence (25%)
This file has low confidence of being a budget file.
Please verify carefully.
```

**Outcome:** They proceed, manually verify the column mappings, and import successfully

---

## Testing Matrix

| File Type | Expected Result | User Action |
|-----------|----------------|-------------|
| Standard Budget | ✓ No warning | Continue normally |
| Budget with unusual names | ⚠️ Low confidence | Verify mappings |
| Payroll file | 🚨 Payroll warning | Cancel and get budget file |
| Expenses file | 🚨 Expenses warning | Cancel and get budget file |
| Invoice file | 🚨 Invoice warning | Cancel and get budget file |
| Empty file | ❌ Error | Upload valid file |
| Random data | ⚠️ Unknown type | Manual mapping needed |

---

## Benefits

### For Users
- ✅ **Catch mistakes early** - Before importing wrong data
- ✅ **Clear explanations** - Understand what's wrong
- ✅ **Save time** - Don't have to clean up bad imports
- ✅ **Build confidence** - Know system validates uploads

### For Admins
- ✅ **Data quality** - Prevent bad data from entering system
- ✅ **Support reduction** - Fewer "I imported wrong file" tickets
- ✅ **Audit trail** - Know when users override warnings
- ✅ **Training tool** - Teach users what budget files should look like

---

## Customization (Developer Guide)

### Add New File Type Detection

Edit `lib/ai/mapping-engine.ts`:

```typescript
const FILE_TYPE_KEYWORDS = {
  budget: [...],
  payroll: [...],
  expenses: [...],
  invoice: [...],

  // Add new type:
  procurement: [
    'vendor', 'supplier', 'rfp', 'rfq', 'bid', 'quote',
    'procurement', 'sourcing', 'contract'
  ]
};
```

### Adjust Confidence Thresholds

```typescript
// In mapping-engine.ts
const budgetConfidence = scores.budget > 0
  ? Math.min(scores.budget / Math.max(totalNonBudgetScore || 1, 3), 1.0)
  : 0;

// Change the denominator (3) to adjust sensitivity:
// - Lower number (2) = More strict, more warnings
// - Higher number (5) = More lenient, fewer warnings
```

### Change Warning Threshold

```typescript
// In page.tsx
if (fileTypeDetection.budgetConfidence < 0.3) {  // 30% threshold
  addToast('warning', ...);
}

// Adjust 0.3 to change when low confidence warning appears
```

---

## Troubleshooting

### "Always getting payroll warning on budget files"

**Cause:** Budget file contains "Department" column, which has employee names or similar data

**Fix:** Check your sample data. If departments are named after people, consider renaming them to functional names (Engineering, Sales, etc.)

---

### "No warning on obvious non-budget file"

**Cause:** File uses generic column names like "Name", "Amount", "Date"

**Fix:** This is expected for generic files. The AI looks for specific keywords. Consider adding more specific columns to your source files.

---

### "False positive - budget file flagged as expenses"

**Cause:** Budget file has columns like "Vendor Budget" or "Expense Category"

**Fix:** The word "expense" triggers detection. This is a judgment call - if it's truly a budget file, click "Continue Anyway" and verify mappings.

---

## Summary

File type detection provides an intelligent safety net to prevent common upload mistakes:

1. **Detects** common non-budget file types (payroll, expenses, invoices)
2. **Warns** users with clear explanation and confirmation dialog
3. **Allows override** if user knows what they're doing
4. **Prevents** accidental bad data imports

Test it out with the sample files in `test-data/` directory!
