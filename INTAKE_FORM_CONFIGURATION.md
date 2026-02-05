# SpendFlo Budget Check API - Intake Form Configuration Guide

**Version:** 1.0
**Date:** February 2026
**Audience:** Onboarding Team, Product Team, Customer Success

---

## Overview

This document outlines the required and optional fields that customers must configure in their SpendFlo intake forms to enable automated budget checking. These fields ensure accurate budget validation and seamless integration with the customer's budget management system.

---

## 🎯 Required Fields (MANDATORY)

These fields **MUST** be configured in every intake form that uses budget checking. Without these, the API cannot determine if budget is available.

### 1. **Department** (Required)
**Field Type:** Dropdown / Select
**API Parameter:** `department`

**Purpose:**
Identifies which department's budget should be checked. Budgets are organized by department, so this is essential for routing the request to the correct budget pool.

**Configuration:**
- **Field Type:** Single-select dropdown
- **Must be mandatory:** YES
- **Allow free text:** NO (must match exact department names in budget system)

**Recommended Values:**
```
- Engineering
- Sales
- Marketing
- Finance
- HR (Human Resources)
- Operations
- IT (Information Technology)
- Legal
- Admin (Administration)
```

**Important Notes:**
- The value must **exactly match** the department name in the customer's budget file
- Case-sensitive matching (use consistent capitalization)
- If customer uses custom department names (e.g., "Product Engineering" instead of "Engineering"), ensure they match exactly

**Rationale:**
Every budget is associated with a specific department. Without knowing which department is making the purchase, we cannot identify which budget pool to check.

---

### 2. **Fiscal Period** (Required)
**Field Type:** Dropdown / Text
**API Parameter:** `fiscalPeriod`

**Purpose:**
Identifies the time period for budget allocation. Companies typically have different budgets for different fiscal periods (quarters, years).

**Configuration:**
- **Field Type:** Dropdown (recommended) or text input with validation
- **Must be mandatory:** YES
- **Format validation:** YES (see formats below)

**Supported Formats:**
```
- FY2025 (Fiscal Year)
- FY2025-Q1 (Fiscal Year + Quarter)
- Q1-2025 (Quarter + Year)
- 2025-Q1 (Year + Quarter)
- FY25 (Short year format)
```

**Recommended Approach:**
1. **Best:** Auto-populate based on current date
   - If request is in Jan-Mar 2025 → default to "FY2025" or "Q1-2025"
   - Reduces user error and form friction

2. **Alternative:** Dropdown with current + next fiscal period
   ```
   - FY2025 (Current)
   - FY2026 (Next Year)
   ```

**Important Notes:**
- Must match the fiscal period format used in customer's budget files
- If customer uploads budgets with "FY2025", intake form must collect "FY2025"
- Recommend standardizing on one format across all customers

**Rationale:**
Budgets are time-bound. A department might have $500K for Q1-2025 and $600K for Q2-2025. Without knowing the fiscal period, we cannot determine which budget pool applies.

---

### 3. **Amount** (Required)
**Field Type:** Number
**API Parameter:** `amount`

**Purpose:**
The dollar value of the purchase request. Used to check if sufficient budget is available.

**Configuration:**
- **Field Type:** Number input (decimal allowed)
- **Must be mandatory:** YES
- **Validation:** Must be greater than 0
- **Currency symbol:** Optional (handled separately)

**Format Examples:**
```
✅ Correct:
- 50000
- 50000.00
- 15,000 (system will parse)

❌ Incorrect:
- $50000 (don't include $ symbol in amount field)
- 50K (don't use abbreviations)
- -100 (negative values not allowed)
```

**Recommended UI:**
```
Purchase Amount: [_________] USD
                  Number input   Currency dropdown
```

**Important Notes:**
- Store as numeric value (not text)
- If using currency dropdown, store amount and currency separately
- System will validate: amount > 0

**Rationale:**
The core purpose of budget checking is to verify if there's enough budget for the requested amount. Without the amount, we cannot perform this check.

---

## ⚙️ Optional Fields (RECOMMENDED)

These fields are not required for the API to function, but they significantly improve accuracy and user experience.

### 4. **Sub-Category** (Optional but Highly Recommended)
**Field Type:** Dropdown / Select
**API Parameter:** `subCategory`

**Purpose:**
When a department has multiple budget categories (e.g., Engineering might have "Software Licenses", "Hardware", "Cloud Infrastructure"), this specifies which specific category to check.

**When to Make Mandatory:**
- ✅ **YES** - If customer maintains detailed budgets with sub-categories
- ❌ **NO** - If customer only has one budget per department

**Configuration:**
- **Field Type:** Dropdown (recommended) or text input
- **Must be mandatory:** Depends on customer's budget structure
- **Dynamic based on department:** YES (ideal - show relevant sub-categories per department)

**Example Structure:**
```
Department: Engineering
Sub-Category options:
  - Software Licenses
  - Hardware
  - Cloud Infrastructure
  - Professional Services

Department: Marketing
Sub-Category options:
  - Advertising
  - Events
  - Marketing Tools
  - Content Creation
```

**Important Notes:**
- Must match sub-category names in budget files exactly
- If customer doesn't use sub-categories, this field can be omitted entirely
- If provided, API will match to specific sub-category budget
- If omitted, API will check department-level budget

**Rationale:**
Many organizations have granular budgets. Engineering might have $500K for software but only $100K for hardware. Sub-categories enable precise budget tracking and prevent one category from consuming another's budget.

**Product Recommendation:**
Ask during onboarding: "Do you track budgets by sub-category or just by department?" and configure form accordingly.

---

### 5. **Currency** (Optional)
**Field Type:** Dropdown
**API Parameter:** `currency`

**Purpose:**
Specifies the currency of the requested amount. Important for multi-national companies operating in different currencies.

**Configuration:**
- **Field Type:** Dropdown
- **Must be mandatory:** NO (defaults to USD)
- **Default value:** USD (or customer's primary currency)

**Supported Currencies:**
```
- USD (US Dollar) - Default
- GBP (British Pound)
- EUR (Euro)
```

**When to Make Mandatory:**
- ✅ **YES** - If customer operates in multiple countries/currencies
- ❌ **NO** - If customer only deals in one currency (use default)

**Currency Conversion:**
The API automatically converts between currencies using standard exchange rates:
- GBP to USD: × 1.27
- USD to GBP: × 0.79

**Important Notes:**
- Budget must be stored in the same currency, or system will auto-convert
- Use standard ISO currency codes (USD, GBP, EUR)
- If your customer needs more currencies, request addition to system

**Rationale:**
For global companies, budgets might be in USD but local teams submit requests in local currency (GBP, EUR). Auto-conversion ensures accurate budget checking regardless of currency mismatch.

---

## 📋 Summary Table

| Field | Required? | Default | Format | Example |
|-------|-----------|---------|--------|---------|
| **department** | ✅ YES | None | Text (dropdown) | "Engineering" |
| **fiscalPeriod** | ✅ YES | None | Text (format validated) | "FY2025" |
| **amount** | ✅ YES | None | Number (> 0) | 50000 |
| **subCategory** | ⚠️ Conditional | null | Text (dropdown) | "Software Licenses" |
| **currency** | ❌ NO | "USD" | ISO code | "USD" |

---

## 🔄 Complete Integration Flow

### Customer Journey:
```
1. User fills intake form
   ↓
2. User submits form
   ↓
3. SpendFlo workflow calls Budget Check API
   POST /api/budget/check
   {
     "department": "Engineering",
     "fiscalPeriod": "FY2025",
     "amount": 50000,
     "subCategory": "Software Licenses",  // optional
     "currency": "USD"                     // optional
   }
   ↓
4. API responds with availability status
   {
     "available": true/false,
     "reason": "Budget available. Will be auto-approved."
   }
   ↓
5. Workflow proceeds based on response
   - If available: Continue to approval
   - If not available: Alert FP&A or reject
```

---

## 🎓 Onboarding Checklist

### For Onboarding Team:

**Step 1: Discover Budget Structure**
- [ ] Does customer track budgets by department only, or by sub-category too?
- [ ] What fiscal period format do they use? (FY2025, Q1-2025, etc.)
- [ ] What departments do they have?
- [ ] Do they operate in multiple currencies?

**Step 2: Configure Intake Form**
- [ ] Add **Department** dropdown (mandatory) - Match customer's department names exactly
- [ ] Add **Fiscal Period** field (mandatory) - Use customer's preferred format or auto-populate
- [ ] Add **Amount** number input (mandatory) - Validate > 0
- [ ] Add **Sub-Category** dropdown (conditional) - Only if customer uses sub-categories
- [ ] Add **Currency** dropdown (conditional) - Only if multi-currency

**Step 3: Validate Configuration**
- [ ] Ensure field names in intake form map to API parameters exactly
- [ ] Test with sample budget data
- [ ] Verify department names match between intake form and budget files
- [ ] Confirm fiscal period format consistency

**Step 4: Document for Customer**
- [ ] Provide customer with required field names and formats
- [ ] Share budget file template with matching column headers
- [ ] Clarify that intake form values must match budget file values exactly

---

## 🚨 Common Issues & Solutions

### Issue 1: "No budget found" errors
**Cause:** Department name mismatch
**Example:** Intake form has "Engineering" but budget file has "Product Engineering"
**Solution:** Ensure exact match between intake form options and budget file department names

### Issue 2: Wrong fiscal period
**Cause:** Format mismatch
**Example:** Budget file uses "FY2025" but intake form collects "2025"
**Solution:** Standardize fiscal period format across intake form and budget files

### Issue 3: Sub-category confusion
**Cause:** Customer has sub-categories in budget file but intake form doesn't collect it
**Solution:** Either:
- Add sub-category field to intake form, OR
- Customer should upload single budget per department (no sub-categories)

### Issue 4: Currency issues
**Cause:** Request in GBP but budget in USD without currency field
**Solution:** Add currency dropdown to intake form

---

## 📊 Real-World Examples

### Example 1: Simple Setup (Department-Level Only)
**Customer:** Small startup, single currency, annual budgets

**Intake Form Configuration:**
```
Department*:        [Dropdown: Engineering, Sales, Marketing, Operations]
Fiscal Period*:     [Auto-populated: "FY2025"]
Purchase Amount*:   [Number input]
```

**Budget File Format:**
```
Department    | Fiscal Period | Budgeted Amount
Engineering   | FY2025       | 500000
Sales         | FY2025       | 300000
Marketing     | FY2025       | 200000
```

---

### Example 2: Advanced Setup (Sub-Categories + Multi-Currency)
**Customer:** Enterprise, global operations, quarterly budgets

**Intake Form Configuration:**
```
Department*:        [Dropdown: Engineering, Sales, Marketing, Finance]
Sub-Category*:      [Dynamic dropdown based on department]
Fiscal Period*:     [Dropdown: Q1-2025, Q2-2025, Q3-2025, Q4-2025]
Purchase Amount*:   [Number input]
Currency:           [Dropdown: USD, GBP, EUR] (default: USD)
```

**Budget File Format:**
```
Department  | Sub-Category        | Fiscal Period | Budgeted Amount | Currency
Engineering | Software Licenses   | Q1-2025      | 500000         | USD
Engineering | Cloud Infrastructure| Q1-2025      | 300000         | USD
Engineering | Hardware            | Q1-2025      | 100000         | USD
Sales       | Sales Tools         | Q1-2025      | 150000         | USD
Marketing   | Advertising         | Q1-2025      | 200000         | USD
```

---

## 🎯 Key Takeaways for Product Team

1. **Mandatory Fields Are Non-Negotiable**
   - Department, Fiscal Period, Amount must always be collected
   - Without these, API will return errors

2. **Sub-Category Is Contextual**
   - Discovery question during onboarding: "Do you track budgets at sub-category level?"
   - If YES → Make sub-category mandatory
   - If NO → Omit field entirely

3. **Smart Defaults Reduce Friction**
   - Auto-populate fiscal period based on current date
   - Default currency to customer's primary currency (usually USD)
   - Pre-fill department if user's department is known

4. **Exact Match Is Critical**
   - Form dropdown values MUST match budget file values exactly
   - Case-sensitive, spacing matters
   - Validation should happen during budget file upload (flag mismatches)

5. **Error Messages Should Be Helpful**
   - If budget check fails, API returns available budgets
   - Use this to guide users: "No budget found for 'Software Licenses'. Did you mean 'Software License'?"

---

## 📞 Support & Questions

For questions about implementing budget checks in customer intake forms:
- **Technical Questions:** Engineering Team
- **Onboarding Questions:** Customer Success Team
- **Product Feedback:** Product Team

For API documentation and testing:
- See `API_DOCUMENTATION.md` for complete endpoint reference
- Test environment: [To be provided]
- Production environment: [To be provided]

---

## 🔄 Document Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | Feb 2026 | Initial document | Engineering |

---

**Questions or feedback on this document?**
Please reach out to the Engineering Team for clarifications or updates.
