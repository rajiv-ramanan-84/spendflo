# Budget Template Guide for Customers

**Version:** 2.0
**Last Updated:** February 2026
**For:** FP&A Teams uploading budgets to SpendFlo

---

## 📥 Download Template

**Excel Template:** [Download sample-budget-template.xlsx](/sample-budget-template.xlsx)
**Google Sheets Template:** [Make a copy of this template](https://docs.google.com/spreadsheets/d/your-template-id)

---

## 📋 Required Columns

Your budget file **MUST** contain these columns (names can vary, our AI will detect them):

| Column | Required? | Format | Examples |
|--------|-----------|--------|----------|
| **Department** | ✅ REQUIRED | Text | Engineering, Sales, Marketing, Finance, HR, Operations, IT, Legal, Admin |
| **Fiscal Period** | ✅ REQUIRED | Text (see formats below) | FY2025, FY2026, Q1-2025, Q2-2025 |
| **Budgeted Amount** | ✅ REQUIRED | Number (no symbols) | 500000, 250000.50 |
| **Sub-Category** | ⚠️ Conditional | Text | Software Licenses, Cloud Infrastructure, Marketing Tools |
| **Currency** | ❌ Optional | 3-letter code | USD, GBP, EUR |

---

## 📅 Fiscal Period Format Guide

### ✅ Supported Formats

Our AI recognizes these fiscal period formats:

#### Annual Budgets
```
✅ FY2025          (Recommended)
✅ FY25            (Short form)
✅ Fiscal Year 2025
✅ 2025
```

#### Quarterly Budgets
```
✅ Q1-2025         (Recommended)
✅ Q2-2025
✅ FY2025-Q1
✅ 2025-Q1
```

### ⚠️ Important Rules

1. **Use ONE format consistently** across your entire file
   - ✅ Good: All rows use "FY2025"
   - ❌ Bad: Mix of "FY2025", "2025", "Fiscal Year 2025"

2. **Match your fiscal year calendar**
   - If your fiscal year starts in January: FY2025 = Jan 1, 2025 - Dec 31, 2025
   - If your fiscal year starts in April: FY2025 = Apr 1, 2025 - Mar 31, 2026

3. **Include current AND next fiscal period**
   - Always upload budgets for at least 2 fiscal periods
   - Example: If today is Feb 2026, upload FY2026 and FY2027
   - This prevents "no budget found" errors for future planning

### 🚨 Common Mistakes

| ❌ Wrong | ✅ Correct | Why |
|---------|-----------|-----|
| FY 2025 | FY2025 | No spaces |
| fy2025 | FY2025 | Use capital letters |
| 2025 Q1 | Q1-2025 | Use hyphen |
| Q5-2025 | Q4-2025 | Only Q1-Q4 exist |
| January 2025 | FY2025 or Q1-2025 | Use standard format |

---

## 🏢 Department Names

### Standard Department Names

Use these standard names (or configure your own):

```
✅ Engineering
✅ Sales
✅ Marketing
✅ Finance
✅ HR (or Human Resources)
✅ Operations
✅ IT (or Information Technology)
✅ Legal
✅ Admin (or Administration)
```

### ⚠️ Critical: Exact Match Required

Department names in your budget file **must exactly match** the department names in your SpendFlo intake form.

**Example of mismatch problem:**
- Budget file: "Product Engineering"
- Intake form: "Engineering"
- Result: ❌ "No budget found"

**Solution:** Ensure consistency between budget file and intake form dropdown options.

---

## 📊 Sub-Category (Optional but Recommended)

### When to Use Sub-Categories

**Use sub-categories if:**
- ✅ Your department has multiple spending categories
- ✅ You want granular budget tracking
- ✅ Different approvers for different categories

**Example: Engineering Department**
```
Department    | Sub-Category           | Budgeted Amount
Engineering   | Software Licenses      | 500,000
Engineering   | Cloud Infrastructure   | 300,000
Engineering   | Hardware               | 100,000
Engineering   | Professional Services  | 150,000
```

**Skip sub-categories if:**
- ❌ Each department has ONE total budget
- ❌ You don't track at granular level

**Example: Simple Structure**
```
Department    | Budgeted Amount
Engineering   | 1,000,000
Sales         | 500,000
Marketing     | 300,000
```

### Sub-Category Naming Best Practices

1. **Be descriptive but concise**
   - ✅ Good: "Software Licenses", "Marketing Tools", "Office Supplies"
   - ❌ Bad: "SWL", "Stuff", "Other"

2. **Use consistent naming**
   - ✅ Good: "Software Licenses" (always)
   - ❌ Bad: Mix of "Software Licenses", "Software License", "SW Licenses"

3. **Don't duplicate department in sub-category**
   - ✅ Good: Sub-Category = "Software Licenses"
   - ❌ Bad: Sub-Category = "Engineering Software Licenses"

---

## 💰 Currency

### Supported Currencies
- **USD** (US Dollar) - Default
- **GBP** (British Pound)
- **EUR** (Euro) - Coming soon

### When to Specify Currency

**Add currency column if:**
- ✅ You have budgets in multiple currencies
- ✅ Your organization operates globally

**Skip currency if:**
- ❌ All budgets are in USD (system defaults to USD)

### Auto-Conversion

The system automatically converts between currencies:
- GBP to USD: × 1.27
- USD to GBP: × 0.79

**Example:**
- Budget: £100,000 GBP
- Request: $127,000 USD
- System converts and matches correctly ✅

---

## 📝 Complete Template Examples

### Example 1: Simple Annual Budgets (No Sub-Categories)

```
Department  | Fiscal Period | Budgeted Amount | Currency
Engineering | FY2025       | 1000000        | USD
Engineering | FY2026       | 1200000        | USD
Sales       | FY2025       | 500000         | USD
Sales       | FY2026       | 600000         | USD
Marketing   | FY2025       | 300000         | USD
Marketing   | FY2026       | 350000         | USD
Finance     | FY2025       | 200000         | USD
Finance     | FY2026       | 250000         | USD
```

---

### Example 2: Detailed Budgets with Sub-Categories

```
Department  | Sub-Category          | Fiscal Period | Budgeted Amount | Currency
Engineering | Software Licenses     | FY2025       | 500000         | USD
Engineering | Cloud Infrastructure  | FY2025       | 300000         | USD
Engineering | Hardware              | FY2025       | 100000         | USD
Engineering | Professional Services | FY2025       | 150000         | USD
Sales       | Sales Tools           | FY2025       | 200000         | USD
Sales       | Travel & Events       | FY2025       | 150000         | USD
Sales       | Commissions Budget    | FY2025       | 150000         | USD
Marketing   | Advertising           | FY2025       | 200000         | USD
Marketing   | Marketing Tools       | FY2025       | 100000         | USD
Finance     | Accounting Software   | FY2025       | 100000         | USD
Finance     | Audit & Compliance    | FY2025       | 100000         | USD
```

---

### Example 3: Quarterly Budgets

```
Department  | Sub-Category      | Fiscal Period | Budgeted Amount | Currency
Engineering | Software Licenses | Q1-2025      | 125000         | USD
Engineering | Software Licenses | Q2-2025      | 125000         | USD
Engineering | Software Licenses | Q3-2025      | 125000         | USD
Engineering | Software Licenses | Q4-2025      | 125000         | USD
Sales       | Sales Tools       | Q1-2025      | 50000          | USD
Sales       | Sales Tools       | Q2-2025      | 50000          | USD
Sales       | Sales Tools       | Q3-2025      | 50000          | USD
Sales       | Sales Tools       | Q4-2025      | 50000          | USD
```

---

### Example 4: Multi-Currency (Global Organization)

```
Department  | Sub-Category      | Fiscal Period | Budgeted Amount | Currency
Engineering | Software Licenses | FY2025       | 500000         | USD
Engineering | Cloud (UK)        | FY2025       | 200000         | GBP
Sales       | Sales Tools (US)  | FY2025       | 300000         | USD
Sales       | Sales Tools (UK)  | FY2025       | 150000         | GBP
Marketing   | Advertising (US)  | FY2025       | 250000         | USD
Marketing   | Advertising (EU)  | FY2025       | 100000         | EUR
```

---

## 🤖 AI Column Mapping

### How It Works

When you upload your budget file, our AI automatically detects which columns contain which data:

**The AI recognizes these column name variations:**

| Field | Recognized Names |
|-------|------------------|
| **Department** | Department, Dept, Division, Team, Business Unit, BU, Cost Center, Org, Organization |
| **Fiscal Period** | Fiscal Period, Time Period, Period, When, Fiscal Year, FY, Quarter, Q, Year, Fiscal |
| **Budgeted Amount** | Budgeted Amount, Budget, Amount, How Much, Total, Allocated, Allocation, Value, Plan Amount |
| **Sub-Category** | Sub-Category, Subcategory, Budget Category, Expense Category, Expense Type, Category, Spending On, Sub Type |
| **Currency** | Currency, Curr, CCY, Money Type, Currency Code, Currency Type |

**You don't need to rename your columns!** The AI adapts to your format.

### AI Confidence Scores

After upload, you'll see confidence scores:
- 🟢 **80-100%**: High confidence - AI is very sure
- 🟡 **50-80%**: Medium confidence - Review recommended
- 🔴 **<50%**: Low confidence - Manual mapping needed

### Review & Confirm Mappings

Even with AI, you'll always have a chance to:
1. Review detected mappings
2. Adjust if needed
3. Confirm before import

**Example UI:**
```
Source Column         →  Target Field         Confidence
"Dept"                →  Department           95% ✅
"Fiscal Year"         →  Fiscal Period        90% ✅
"Budget Amt"          →  Budgeted Amount      85% ✅
"What we're buying"   →  Sub-Category         60% ⚠️  (Review)
"Unmapped Column"     →  (Not mapped)         —
```

---

## ✅ Pre-Upload Checklist

Before uploading your budget file, verify:

### Required Fields
- [ ] **Department column exists** with valid department names
- [ ] **Fiscal Period column exists** with consistent format (e.g., all "FY2025")
- [ ] **Budgeted Amount column exists** with numeric values (no $ symbols)

### Data Quality
- [ ] **No empty rows** in the middle of your data
- [ ] **No merged cells** (Excel files only)
- [ ] **All amounts are positive numbers** (no negatives or zero)
- [ ] **Department names match** your intake form exactly
- [ ] **Fiscal period format is consistent** (don't mix FY2025 and 2025)

### Coverage
- [ ] **Current fiscal period included** (e.g., if today is Feb 2026, include FY2026)
- [ ] **Next fiscal period included** (e.g., include FY2027 for future planning)
- [ ] **All active departments included** (don't leave out departments)

### Optional but Recommended
- [ ] **Sub-categories included** if you track detailed budgets
- [ ] **Currency specified** if using multiple currencies
- [ ] **No duplicate rows** (same department + sub-category + fiscal period)

---

## 🚨 Common Upload Errors & Solutions

### Error: "Missing required field: department"

**Cause:** No column detected as department
**Solution:**
1. Ensure you have a column with department names
2. Use recognized names: "Department", "Dept", "Division", "Team"
3. If using custom name, manually map it during upload

---

### Error: "Missing required field: fiscalPeriod"

**Cause:** No column detected as fiscal period
**Solution:**
1. Add a column with fiscal periods (FY2025, Q1-2025, etc.)
2. Use recognized names: "Fiscal Period", "Period", "FY", "Quarter"
3. Ensure values match supported formats (see Fiscal Period Format Guide)

---

### Error: "Missing required field: budgetedAmount"

**Cause:** No column with budget amounts, or values aren't numeric
**Solution:**
1. Add a column with numeric budget amounts
2. Remove $ symbols and commas (500000 not $500,000)
3. Use recognized names: "Budgeted Amount", "Budget", "Amount", "Total"

---

### Error: "No budget found for this department/category"

**Cause:** Department or sub-category name mismatch
**Solution:**
1. Check exact spelling in your budget file vs. intake form
2. Verify case sensitivity (Engineering ≠ engineering)
3. Check for extra spaces ("Engineering " ≠ "Engineering")
4. Ensure fiscal period matches your current calendar

---

### Warning: "Low confidence mapping for [column]"

**Cause:** AI isn't sure what a column represents
**Solution:**
1. Review the suggested mapping in the upload wizard
2. Manually select the correct target field if wrong
3. Consider renaming the column to a more standard name

---

### Error: "Fiscal period format inconsistent"

**Cause:** Multiple formats in same file (FY2025, 2025, Fiscal Year 2025)
**Solution:**
1. Pick ONE format (recommend: FY2025 or Q1-2025)
2. Use find/replace to standardize all rows
3. Re-upload file

---

### Error: "Duplicate budget entry"

**Cause:** Same department + sub-category + fiscal period appears twice
**Solution:**
1. Consolidate duplicate rows
2. If intentional (multiple sources), combine amounts
3. Remove duplicate row

---

## 🔄 Updating Budgets

### Option 1: Upload New File (Recommended)
1. Download your current budget (Export from dashboard)
2. Make changes in Excel/Google Sheets
3. Upload updated file
4. System will update existing budgets, create new ones

### Option 2: Edit Individual Budgets
1. Go to Budgets page
2. Click ✏️ Edit on any budget
3. Update values
4. Save (creates audit log entry)

### Option 3: Google Sheets Sync
1. Store budget in Google Sheets
2. Connect to SpendFlo (one-time OAuth)
3. Changes in sheet automatically sync
4. Always up-to-date

---

## 🎓 Best Practices

### 1. Maintain a Master Budget File
- Keep one "source of truth" Excel or Google Sheet
- Update it quarterly/annually
- Upload to SpendFlo after changes
- Version control (Budget_2025_v1.xlsx, Budget_2025_v2.xlsx)

### 2. Plan Ahead
- Always include current + next 2 fiscal periods
- Example in Feb 2026: Include FY2026, FY2027, FY2028
- Prevents "no budget found" errors for future planning

### 3. Use Descriptive Names
- Clear department names (not abbreviations)
- Descriptive sub-categories
- Standard fiscal period format

### 4. Review Before Upload
- Use the pre-upload checklist
- Spot-check a few rows
- Verify totals make sense

### 5. Test with Small File First
- Upload 5-10 rows as a test
- Verify mappings are correct
- Then upload full budget

---

## 📞 Need Help?

### During Upload
- The upload wizard shows real-time validation
- Yellow warnings = review recommended
- Red errors = must fix before proceeding
- You can adjust AI mappings before confirming

### After Upload
- View all budgets at `/budgets`
- Check audit log at `/audit` for import history
- Export to verify what was imported

### Contact Support
- **Technical Issues:** Engineering team
- **Budget Questions:** Your FP&A admin
- **Template Customization:** Customer success team

---

## 📝 Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Feb 2026 | Added fiscal period format guide, AI mapping details, comprehensive examples |
| 1.0 | Jan 2026 | Initial template guide |

---

**Ready to upload your budget?**
[Go to FP&A Upload Page](/fpa/upload) | [Download Template](/sample-budget-template.xlsx)
