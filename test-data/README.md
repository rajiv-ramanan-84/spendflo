# Test CSV Files for Budget Sync

These test files demonstrate different scenarios and formats that the AI mapper can handle.

## Test Files

### 1. **1_standard_format.csv**
**Purpose**: Test standard column names
**Rows**: 15
**Features**: All fields present, standard naming
**Expected**: High confidence (90%+), all fields mapped

---

### 2. **2_abbreviated_format.csv**
**Purpose**: Test abbreviated column names
**Rows**: 9
**Features**: Short names (Dept, FY, Amt, Curr)
**Expected**: Medium-high confidence (70-90%), fuzzy matching works

---

### 3. **3_anaplan_style.csv**
**Purpose**: Test Anaplan export format
**Rows**: 11
**Features**: Anaplan-specific columns (Cost Center, Plan Amount, Version)
**Expected**: High confidence, recognizes Anaplan patterns

---

### 4. **4_prophix_style.csv**
**Purpose**: Test Prophix export format
**Rows**: 9
**Features**: Underscores in names (Budget_Amount), org codes (ENG -)
**Expected**: High confidence, handles underscores and codes

---

### 5. **5_multi_currency.csv**
**Purpose**: Test multi-currency support
**Rows**: 10
**Features**: USD, EUR, GBP, JPY, INR, CAD
**Expected**: All currencies preserved, correct mapping

---

### 6. **6_with_typos.csv**
**Purpose**: Test typo detection
**Rows**: 6
**Features**: Deliberate typos (Departmnet, Buget, Currancy)
**Expected**: Still maps correctly via Levenshtein distance

---

### 7. **7_minimal_required_only.csv**
**Purpose**: Test minimal required fields
**Rows**: 10
**Features**: Only Department, Fiscal Period, Budget Amount (no sub-category, defaults to USD)
**Expected**: Works fine, suggests adding optional fields

---

### 8. **8_quarterly_budget.csv**
**Purpose**: Test quarterly fiscal periods
**Rows**: 16
**Features**: Q1 2025, Q2 2025, Q3 2025, Q4 2025
**Expected**: All quarters mapped correctly

---

### 9. **9_large_dataset.csv**
**Purpose**: Test performance with realistic dataset
**Rows**: 48
**Features**: Multiple departments, many sub-categories
**Expected**: Completes in <5 seconds, all rows imported

---

### 10. **10_with_currency_symbols.csv**
**Purpose**: Test currency symbol handling
**Rows**: 6
**Features**: Dollar signs and commas ($500,000)
**Expected**: Symbols stripped, amounts parsed correctly

---

## How to Test

### Option 1: Via UI (Recommended)

1. **Open UI**: http://localhost:3000/admin/budget-sync
2. **Set Customer ID**: `test_customer_123`
3. **Create Config**:
   - Source Type: Manual Upload
   - Frequency: Manual Only
   - Click "Create Configuration"
4. **Copy test file** to upload directory:
   ```bash
   cp test-data/1_standard_format.csv /tmp/spendflo-budget-imports/
   ```
5. **Trigger Sync**: Click "Trigger Sync Now"
6. **Check Results**: View sync history table

### Option 2: Via API

```bash
# 1. Create config
curl -X POST http://localhost:3000/api/sync/config \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer_123",
    "sourceType": "upload",
    "enabled": true,
    "frequency": "manual",
    "sourceConfig": {
      "localPath": "/tmp/spendflo-budget-imports"
    }
  }'

# 2. Copy test file
cp test-data/1_standard_format.csv /tmp/spendflo-budget-imports/

# 3. Trigger sync
curl -X POST http://localhost:3000/api/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{"customerId": "test_customer_123"}'

# 4. Check history
curl http://localhost:3000/api/sync/history?customerId=test_customer_123
```

### Option 3: Direct Integration Test

```bash
# Run tests with specific dataset
npx jest tests/integration/sync-flow.test.ts \
  --testNamePattern="should execute complete sync workflow"
```

---

## Expected Results

### Success Indicators
- ✅ Status: "success"
- ✅ Errors: 0
- ✅ Created count matches row count
- ✅ All departments appear in database

### AI Mapping Confidence
- **Standard format**: 90-100%
- **Abbreviated**: 70-90%
- **Anaplan/Prophix**: 80-95%
- **Typos**: 60-80% (still correct!)
- **Minimal**: 100% (for required fields)

---

## Testing Different Scenarios

### Test 1: Basic Functionality
**File**: `1_standard_format.csv`
**What it tests**: Standard happy path
**Expected**: All 15 budgets imported, zero errors

### Test 2: Fuzzy Matching
**File**: `2_abbreviated_format.csv`
**What it tests**: AI can detect "Dept" = Department
**Expected**: All 9 budgets imported, confidence 70%+

### Test 3: Enterprise Format
**File**: `3_anaplan_style.csv`
**What it tests**: Handles FP&A tool exports
**Expected**: All 11 budgets imported, recognizes Anaplan columns

### Test 4: Error Tolerance
**File**: `6_with_typos.csv`
**What it tests**: Levenshtein distance for typos
**Expected**: All 6 budgets imported despite typos

### Test 5: Multi-Currency
**File**: `5_multi_currency.csv`
**What it tests**: Currency preservation
**Expected**: All 10 budgets with correct currencies

### Test 6: Performance
**File**: `9_large_dataset.csv`
**What it tests**: Realistic dataset size
**Expected**: Completes in <5 seconds, all 48 rows imported

---

## Troubleshooting

### No budgets imported
- Check Customer ID matches in config
- Verify file is in correct directory
- Check sync history for errors

### Low confidence warnings
- Normal for abbreviated names
- Budgets still import correctly
- Can manually confirm mappings if needed

### Currency not detected
- Defaults to USD (this is OK)
- Add "Currency" column for multi-currency

### Performance issues
- Files >500 rows may take 10-30 seconds
- This is normal for first import
- Updates are faster (only changed rows)

---

## Next Steps

1. **Test all 10 files** to validate different scenarios
2. **Create your own test file** with your data format
3. **Monitor sync history** for patterns
4. **Check database** to verify budgets imported correctly

Happy testing! 🚀
