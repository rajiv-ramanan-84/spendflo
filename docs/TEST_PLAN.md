# Test Plan & Test Cases
## SpendFlo Budget Management Service

**Version:** 1.0
**Last Updated:** February 2, 2026
**Test Environment:** Development, Staging, Production

---

## 1. Test Strategy

### 1.1 Testing Pyramid
```
         /\
        /E2E\          10% - End-to-End (Playwright)
       /------\
      /  API  \        30% - API/Integration Tests
     /----------\
    /   Unit     \     60% - Unit Tests
   /--------------\
```

### 1.2 Test Types
- **Unit Tests:** Individual functions and components
- **Integration Tests:** API endpoints and database operations
- **E2E Tests:** Complete user workflows (Playwright)
- **Manual Tests:** UI/UX verification
- **Performance Tests:** Load and stress testing
- **Security Tests:** Input validation and injection prevention

### 1.3 Testing Tools
- **E2E:** Playwright
- **Unit:** Jest (future)
- **API:** Playwright + cURL
- **Manual:** Browser testing checklist
- **Performance:** k6 (future)

### 1.4 Test Environments
- **Local Development:** http://localhost:3000
- **Railway Staging:** TBD
- **Railway Production:** Live deployment

---

## 2. Test Cases

### 2.1 Homepage Tests

#### TC-HOME-001: Homepage Loads Successfully
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to / | Page loads within 3s |
| 2 | Check page title | Title contains "SpendFlo Budget Module" |
| 3 | Verify navigation | Header shows: SpendFlo, Budgets, New Request |
| 4 | Verify tiles | 3 tiles visible: FP&A User, Business User, Test API |
| 5 | Check no redundant links | No "Quick Links" section at bottom |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-HOME-002: Navigation Links Work
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "FP&A User" tile | Navigates to /fpa/upload |
| 2 | Go back, click "Business User" tile | Navigates to /business/request-v2 |
| 3 | Go back, click "Test API" tile | Navigates to /test |
| 4 | Click "Budgets" in header | Navigates to /dashboard |
| 5 | Click "New Request" in header | Navigates to /business/request-v2 |

**Automated:** ✓ (tests/e2e.spec.ts)

---

### 2.2 Dashboard Tests

#### TC-DASH-001: Dashboard Loads With Data
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /dashboard | Page loads within 3s |
| 2 | Check header | "Budget Dashboard" visible |
| 3 | Verify summary cards | 4 cards: Total Budget, Committed, Reserved, Available |
| 4 | Check utilization bar | Progress bar with percentage |
| 5 | Verify health status | 4 sections: Healthy, Warning, High Risk, Critical |
| 6 | Check budgets table | Table with columns: Department, Sub-Category, Period, Currency, Amounts |
| 7 | Verify action buttons | Export and Cleanup buttons visible |
| 8 | Verify NO Add Budget button | "Add Budget" button NOT present |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-DASH-002: Dashboard Loads Empty State
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Clear all budgets from database | Database empty |
| 2 | Navigate to /dashboard | Page loads within 3s |
| 3 | Check for loading spinner | Loading spinner disappears after <3s |
| 4 | Verify empty state | Message: "No budgets found" or friendly empty state |
| 5 | Check summary shows zeros | Total Budget: $0, Committed: $0, etc. |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-DASH-003: Dashboard Handles API Failure
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Stop database or break API | Database unavailable |
| 2 | Navigate to /dashboard | Page loads (doesn't crash) |
| 3 | Check for error message | Toast/banner shows error |
| 4 | Verify empty state | Shows zero metrics, not infinite loading |
| 5 | Page remains functional | No JavaScript errors |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-DASH-004: Export to Excel Works
**Priority:** P1 (High)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /dashboard | Dashboard loads |
| 2 | Click "Export" button | File download starts |
| 3 | Check downloaded file | .xlsx file with correct name |
| 4 | Open file in Excel | All budget data present |
| 5 | Verify columns | All columns match: Department, Sub-Category, Period, Currency, Budgeted, Committed, Reserved, Available |

**Automated:** ✗ (File downloads hard to test)

#### TC-DASH-005: Cleanup Duplicates Works
**Priority:** P1 (High)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create duplicate budgets | Upload Excel with duplicates |
| 2 | Navigate to /dashboard | Duplicates visible in table |
| 3 | Click "Clean Duplicates" button | Confirmation dialog appears |
| 4 | Click "Yes, Clean Up" | Process runs |
| 5 | Check result message | "Removed X duplicate budgets" |
| 6 | Verify table | Duplicates removed, correct one kept |

**Automated:** Partial

#### TC-DASH-006: Edit Budget Works
**Priority:** P1 (High)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /dashboard | Dashboard loads |
| 2 | Click "Edit" on a budget | Modal opens |
| 3 | Change budgeted amount to higher value | Input accepts change |
| 4 | Click "Save" | Modal closes, success message |
| 5 | Verify table updated | New amount shows in table |
| 6 | Try reducing below committed+reserved | Error message shows, save disabled |

**Automated:** ✗ (Modal interactions complex)

#### TC-DASH-007: Release Budget Works
**Priority:** P1 (High)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Find budget with reserved/committed | Budget has locked amounts |
| 2 | Click "Release" button | Modal opens |
| 3 | See current amounts | Reserved and Committed displayed |
| 4 | Select "Reserved only" | Option highlighted |
| 5 | Click "Release Budget" | Success message |
| 6 | Verify amounts updated | Reserved = 0, Committed unchanged |

**Automated:** ✗ (Modal interactions complex)

#### TC-DASH-008: Delete Budget Works
**Priority:** P1 (High)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Find budget with zero utilization | No committed/reserved |
| 2 | Click "Delete" button | Confirmation dialog |
| 3 | Click "Delete" | Budget removed from table |
| 4 | Try deleting budget with utilization | Delete button disabled or error shown |

**Automated:** Partial

#### TC-DASH-009: Old /budgets Route Redirects
**Priority:** P1 (High)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /budgets | Immediate redirect |
| 2 | Check URL | Now at /dashboard |
| 3 | Verify dashboard loads | Dashboard visible |

**Automated:** ✓ (tests/e2e.spec.ts)

---

### 2.3 Budget Upload Tests

#### TC-UPLOAD-001: Upload Valid Excel File
**Priority:** P0 (Critical)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /fpa/upload | Upload page loads |
| 2 | Select valid Excel file | File selected |
| 3 | File has columns: Department, Sub-Category, Fiscal Period, Budgeted Amount, Currency | File valid |
| 4 | Click "Upload" | Processing starts |
| 5 | Wait for completion | Success message within 10s |
| 6 | Check summary | "X budgets created, Y updated" |
| 7 | Navigate to dashboard | New budgets visible |

**Test Data:**
```
Department | Sub-Category | Fiscal Period | Budgeted Amount | Currency
Engineering | Software | FY2026 | 500000 | USD
Sales | Software | FY2026 | 200000 | USD
Marketing | Advertising | Q1-2026 | 50000 | USD
```

**Automated:** ✗ (File upload complex)

#### TC-UPLOAD-002: Upload With Missing Columns
**Priority:** P0 (Critical)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create Excel without "Currency" column | File missing required field |
| 2 | Navigate to /fpa/upload | Upload page loads |
| 3 | Select invalid file | File selected |
| 4 | Click "Upload" | Error message immediately |
| 5 | Check error details | "Missing required column: Currency" |

**Automated:** ✗

#### TC-UPLOAD-003: Upload With Invalid Data
**Priority:** P1 (High)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create Excel with negative amount | Amount = -1000 |
| 2 | Upload file | Processing starts |
| 3 | Check failed imports | "Invalid amount: must be positive" |
| 4 | Verify good rows processed | Other rows succeed |

**Automated:** ✗

#### TC-UPLOAD-004: Update Existing Budget
**Priority:** P0 (Critical)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Upload file with existing budget | Engineering/Software/FY2026 exists |
| 2 | File has higher amount | New amount: $600,000 (was $500,000) |
| 3 | Upload completes | "1 budget updated" |
| 4 | Check dashboard | Amount updated to $600,000 |
| 5 | Check audit log | Change logged with user and reason |

**Automated:** ✗

#### TC-UPLOAD-005: Cannot Reduce Below Utilization
**Priority:** P0 (Critical)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Budget has $100K committed, $50K reserved | Total utilization: $150K |
| 2 | Upload file with new amount: $100K | Trying to reduce below utilization |
| 3 | Upload processes | Failed import for this row |
| 4 | Check error | "Cannot reduce below committed + reserved ($150,000)" |

**Automated:** ✗

---

### 2.4 Budget Request Form Tests

#### TC-FORM-001: Form Loads With Correct Styling
**Priority:** P0 (Critical)
**Type:** E2E + Visual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /business/request-v2 | Form loads |
| 2 | Check page background | White or light gray (bg-gray-50) |
| 3 | Check form background | White (bg-white) |
| 4 | Verify label text | Dark gray (text-gray-700), readable |
| 5 | Verify input text | Dark gray (text-gray-900), readable |
| 6 | Check input backgrounds | White (NOT transparent) |
| 7 | Check input borders | Visible gray borders |
| 8 | Verify placeholder text | Light gray (text-gray-400), readable |
| 9 | Check no white-on-white text | ALL text has contrast ratio >4.5:1 |

**Automated:** ✓ (tests/e2e.spec.ts - structural)
**Manual:** Required for visual verification

#### TC-FORM-002: All Fields Present
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /business/request-v2 | Form loads |
| 2 | Check Vendor field | Input visible with placeholder |
| 3 | Check Purpose field | Textarea visible |
| 4 | Check Contract Term | 3 buttons: Monthly, Annual, One-time |
| 5 | Check Amount field | Number input with $ prefix |
| 6 | Check Department field | Searchable input |
| 7 | Check NO Fiscal Period field | Fiscal Period input NOT present |
| 8 | Check Submit button | Button visible and initially disabled |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-FORM-003: Department Dropdown Opens Immediately
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to form | Form loads |
| 2 | Click Department field | Dropdown opens immediately |
| 3 | Check dropdown content | All departments visible |
| 4 | Verify NO "Start typing" message | Departments shown without typing |
| 5 | Check dropdown styling | White background, dark text, readable |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-FORM-004: Department Search Filters Results
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to form | Form loads |
| 2 | Click Department field | Dropdown opens |
| 3 | Type "Eng" | Dropdown filters |
| 4 | Check results | "Engineering" visible, others hidden |
| 5 | Type "Sales" | Results update |
| 6 | Check results | "Sales" visible, "Engineering" hidden |
| 7 | Clear field | All departments shown again |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-FORM-005: Smart Vendor-to-Department Mapping
**Priority:** P1 (High)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to form | Form loads |
| 2 | Type "Salesforce" in Vendor | Vendor field has value |
| 3 | Check Department field | Auto-suggests "Sales" |
| 4 | Type "AWS" in Vendor | Vendor changes |
| 5 | Check Department field | Auto-suggests "Engineering" |
| 6 | User can override suggestion | Can manually select different department |

**Automated:** Partial

#### TC-FORM-006: Real-Time Budget Check
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Fill Vendor: "Test Vendor" | Field has value |
| 2 | Fill Purpose: "Test" | Field has value |
| 3 | Fill Amount: "10000" | Field has value |
| 4 | Select Contract Term: "Annual" | Button selected |
| 5 | Select Department: "Engineering" | Dropdown selection made |
| 6 | Wait 500ms | Budget check API called |
| 7 | Check loading indicator | Spinner shows during check |
| 8 | Verify result displayed | Green box if available OR Red box if insufficient |
| 9 | Check budget details | Shows: Request Amount, Available, Utilization |

**Automated:** Partial (tests/e2e.spec.ts)

#### TC-FORM-007: Submit With Sufficient Budget
**Priority:** P0 (Critical)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Fill all fields correctly | All required fields filled |
| 2 | Budget check shows available | Green status |
| 3 | Click "Submit Request" | Loading state |
| 4 | Wait for response | Success message appears |
| 5 | Check message | "Reserved $X from [Department]" |
| 6 | Verify dashboard updated | Reserved amount increased |

**Automated:** ✗ (Requires database setup)

#### TC-FORM-008: Cannot Submit With Insufficient Budget
**Priority:** P0 (Critical)
**Type:** Manual

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Fill all fields | Amount > Available budget |
| 2 | Budget check runs | Red status: "Insufficient budget" |
| 3 | Check Submit button | Button disabled |
| 4 | Hover over button | Tooltip or disabled state clear |
| 5 | Try clicking | Nothing happens |

**Automated:** Partial

#### TC-FORM-009: Form Validation
**Priority:** P1 (High)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to form | Form loads |
| 2 | Click Submit (empty form) | Button disabled, no submission |
| 3 | Fill only Vendor | Button still disabled |
| 4 | Fill Vendor + Purpose | Button still disabled |
| 5 | Fill Vendor + Purpose + Amount | Button still disabled |
| 6 | Add Contract Term + Department | Button enabled |
| 7 | Clear Amount | Button disabled again |

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-FORM-010: Old Routes Redirect
**Priority:** P1 (High)
**Type:** E2E

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /requests/new | Redirects |
| 2 | Check URL | Now at /business/request-v2 |
| 3 | Navigate to /business/request | Redirects |
| 4 | Check URL | Now at /business/request-v2 |

**Automated:** ✓ (tests/e2e.spec.ts)

---

### 2.5 API Tests

#### TC-API-001: Health Check
**Priority:** P0 (Critical)
**Type:** API

```bash
curl http://localhost:3000/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-02T12:00:00Z",
  "version": "1.0.0"
}
```

**Status Code:** 200

**Automated:** ✓ (tests/e2e.spec.ts)

#### TC-API-002: Check Budget (Sufficient)
**Priority:** P0 (Critical)
**Type:** API

```bash
curl -X POST http://localhost:3000/api/budget/check \
  -H "Content-Type: application/json" \
  -d '{
    "department": "Engineering",
    "fiscalPeriod": "FY2026",
    "amount": 10000,
    "currency": "USD"
  }'
```

**Expected Response:**
```json
{
  "isAvailable": true,
  "budgetId": "clx123...",
  "budgetDetails": {
    "totalBudget": 500000,
    "committed": 200000,
    "reserved": 50000,
    "available": 250000,
    "utilizationPercent": 50,
    "newUtilizationPercent": 52
  }
}
```

**Status Code:** 200

**Automated:** Partial

#### TC-API-003: Check Budget (Insufficient)
**Priority:** P0 (Critical)
**Type:** API

```bash
curl -X POST http://localhost:3000/api/budget/check \
  -H "Content-Type: application/json" \
  -d '{
    "department": "Engineering",
    "fiscalPeriod": "FY2026",
    "amount": 1000000,
    "currency": "USD"
  }'
```

**Expected Response:**
```json
{
  "isAvailable": false,
  "reason": "Insufficient budget. Available: $250,000, Requested: $1,000,000",
  "budgetId": "clx123...",
  "budgetDetails": { ... }
}
```

**Status Code:** 200

**Automated:** ✗

#### TC-API-004: Reserve Budget
**Priority:** P0 (Critical)
**Type:** API

```bash
curl -X POST http://localhost:3000/api/budget/reserve \
  -H "Content-Type: application/json" \
  -d '{
    "budgetId": "clx123",
    "amount": 50000,
    "requestId": "req-test-001",
    "userId": "test@example.com",
    "reason": "Test reservation"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "reservationId": "clx456...",
  "expiresAt": "2026-02-04T12:00:00Z"
}
```

**Status Code:** 200

**Automated:** ✗

#### TC-API-005: Reserve Budget (Insufficient)
**Priority:** P0 (Critical)
**Type:** API

Same request as TC-API-004 but with amount > available

**Expected Response:**
```json
{
  "success": false,
  "error": "Insufficient budget"
}
```

**Status Code:** 400

**Automated:** ✗

#### TC-API-006: Commit Budget
**Priority:** P0 (Critical)
**Type:** API

```bash
curl -X POST http://localhost:3000/api/budget/commit \
  -H "Content-Type: application/json" \
  -d '{
    "budgetId": "clx123",
    "amount": 50000,
    "requestId": "req-test-001",
    "userId": "approver@example.com",
    "reason": "Purchase approved"
  }'
```

**Expected Response:**
```json
{
  "success": true
}
```

**Status Code:** 200

**Automated:** ✗

#### TC-API-007: Release Budget
**Priority:** P0 (Critical)
**Type:** API

```bash
curl -X POST http://localhost:3000/api/budget/release \
  -H "Content-Type: application/json" \
  -d '{
    "budgetId": "clx123",
    "amount": 50000,
    "releaseType": "reserved",
    "requestId": "req-test-001",
    "userId": "admin@example.com",
    "reason": "Request canceled"
  }'
```

**Expected Response:**
```json
{
  "success": true
}
```

**Status Code:** 200

**Automated:** ✗

#### TC-API-008: Get Budget Status
**Priority:** P1 (High)
**Type:** API

```bash
curl http://localhost:3000/api/budget/status/req-test-001
```

**Expected Response:**
```json
{
  "requestId": "req-test-001",
  "budgetId": "clx123",
  "status": "reserved",
  "amount": 50000,
  "timestamp": "2026-02-02T12:00:00Z"
}
```

**Status Code:** 200

**Automated:** ✗

#### TC-API-009: Get All Budgets
**Priority:** P1 (High)
**Type:** API

```bash
curl http://localhost:3000/api/budgets
```

**Expected Response:**
```json
[
  {
    "id": "clx123",
    "department": "Engineering",
    "subCategory": "Software",
    "fiscalPeriod": "FY2026",
    "budgetedAmount": 500000,
    "currency": "USD",
    "utilization": {
      "committedAmount": 200000,
      "reservedAmount": 50000
    }
  }
]
```

**Status Code:** 200

**Automated:** ✓ (tests/e2e.spec.ts)

---

### 2.6 Database & Data Integrity Tests

#### TC-DATA-001: Unique Budget Constraint
**Priority:** P0 (Critical)
**Type:** Integration

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create budget: Engineering/Software/FY2026 | Budget created |
| 2 | Try creating duplicate | Database error or handled gracefully |
| 3 | Check database | Only 1 budget exists |
| 4 | Try uploading Excel with duplicate | Update existing, don't create new |

**Automated:** ✗

#### TC-DATA-002: Budget Cannot Go Negative
**Priority:** P0 (Critical)
**Type:** Integration

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Budget: $100K, Committed: $80K, Reserved: $20K | Available: $0 |
| 2 | Try reserving $10K more | API returns error |
| 3 | Check database | Utilization unchanged |

**Automated:** ✗

#### TC-DATA-003: Audit Log Created
**Priority:** P1 (High)
**Type:** Integration

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Upload budget with amount $100K | Budget created |
| 2 | Check audit log | Entry: "CREATE budget $100K by user@example.com" |
| 3 | Update budget to $150K | Budget updated |
| 4 | Check audit log | Entry: "UPDATE budgetedAmount $100K -> $150K by user@example.com" |

**Automated:** ✗

#### TC-DATA-004: Currency Handling
**Priority:** P1 (High)
**Type:** Integration

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create budget in USD | Currency = USD |
| 2 | Create budget in GBP | Currency = GBP |
| 3 | Try EUR | Error: "Only USD and GBP supported" |
| 4 | Check API responses | Amounts display correct currency symbol |

**Automated:** ✗

---

### 2.7 Performance Tests

#### TC-PERF-001: API Response Time
**Priority:** P1 (High)
**Type:** Performance

| Endpoint | Expected Response Time (p95) |
|----------|----------------------------|
| /api/budget/check | <2s |
| /api/budget/reserve | <2s |
| /api/budget/commit | <2s |
| /api/budget/release | <2s |
| /api/budgets | <2s |
| /api/dashboard/stats | <2s |

**Test Method:** Run 100 requests, measure p95
**Automated:** ✗ (Requires k6 or similar)

#### TC-PERF-002: Dashboard Load Time
**Priority:** P1 (High)
**Type:** Performance

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to /dashboard | Page loads |
| 2 | Measure time to interactive | <3s with 100 budgets |
| 3 | Measure time to interactive | <3s with 1000 budgets |

**Automated:** Partial (Playwright can measure)

#### TC-PERF-003: Excel Upload Performance
**Priority:** P1 (High)
**Type:** Performance

| Rows | Expected Processing Time |
|------|-------------------------|
| 100 | <5s |
| 1000 | <10s |
| 5000 | <30s |

**Automated:** ✗

---

### 2.8 Security Tests

#### TC-SEC-001: SQL Injection Prevention
**Priority:** P0 (Critical)
**Type:** Security

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit form with vendor: `'; DROP TABLE Budget; --` | Input sanitized |
| 2 | Check database | Table exists, no damage |
| 3 | Try in department field | Same result |
| 4 | Try in all text inputs | All sanitized |

**Automated:** ✗ (Manual testing required)

#### TC-SEC-002: XSS Prevention
**Priority:** P0 (Critical)
**Type:** Security

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit vendor: `<script>alert('XSS')</script>` | Input escaped |
| 2 | View in dashboard | Script tag visible as text, not executed |
| 3 | Check page source | HTML entities encoded |

**Automated:** ✗

#### TC-SEC-003: Input Validation
**Priority:** P0 (Critical)
**Type:** Security

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit negative amount | Error: "Amount must be positive" |
| 2 | Submit amount > MAX_SAFE_INTEGER | Error: "Amount too large" |
| 3 | Submit invalid currency | Error: "Invalid currency" |
| 4 | Submit empty required field | Error: "Field required" |

**Automated:** Partial

---

### 2.9 Accessibility Tests

#### TC-A11Y-001: Keyboard Navigation
**Priority:** P1 (High)
**Type:** Accessibility

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to form | Form loads |
| 2 | Tab through all fields | Each field focused in order |
| 3 | Tab to submit button | Button focused |
| 4 | Press Enter | Form submits (if valid) |
| 5 | Use Shift+Tab | Navigate backwards |

**Automated:** ✗

#### TC-A11Y-002: Screen Reader Support
**Priority:** P1 (High)
**Type:** Accessibility

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enable VoiceOver/NVDA | Screen reader on |
| 2 | Navigate form | Labels read correctly |
| 3 | Focus required fields | "Required" announced |
| 4 | Trigger validation error | Error read aloud |

**Automated:** ✗

#### TC-A11Y-003: Color Contrast
**Priority:** P0 (Critical)
**Type:** Accessibility

| Element | Contrast Ratio | WCAG AA Requirement |
|---------|---------------|---------------------|
| Body text (text-gray-900 on white) | >7:1 | ✓ Pass (>4.5:1) |
| Label text (text-gray-700 on white) | >7:1 | ✓ Pass |
| Placeholder (text-gray-400 on white) | >4.5:1 | ✓ Pass |
| Button text (white on pink-500) | >4.5:1 | ✓ Pass |
| Error text (red-600 on white) | >7:1 | ✓ Pass |

**Tool:** WebAIM Contrast Checker
**Automated:** ✗ (Use axe-core in future)

---

## 3. Test Execution

### 3.1 Pre-Commit Checklist

Before committing code, developer MUST:

- [ ] Run `npm run build` - build succeeds
- [ ] Run `npm test` - all E2E tests pass
- [ ] Manually test changed functionality
- [ ] Check UI for white-on-white or readability issues
- [ ] Verify database connection works
- [ ] Check browser console for errors
- [ ] Test on Chrome, Safari, Firefox

### 3.2 Pre-Deployment Checklist

Before deploying to Railway:

- [ ] All E2E tests pass locally
- [ ] Manual smoke test of key workflows
- [ ] Database migrations applied
- [ ] Environment variables set correctly
- [ ] Build succeeds in CI/CD
- [ ] No console errors in production build

### 3.3 Regression Testing

After each release, run:
- All P0 (Critical) test cases
- All automated E2E tests
- API smoke tests
- Dashboard load test
- Form submission test

---

## 4. Bug Priority Definitions

### P0 - Critical (Blocker)
- Application doesn't load
- Database connection fails
- API returns 500 errors
- Data loss or corruption
- White-on-white unreadable text
- Cannot submit requests
- Cannot upload budgets

**Fix Timeline:** Immediate (same day)

### P1 - High (Major)
- Feature doesn't work as designed
- Poor performance (>5s load time)
- Confusing UX
- Missing validation
- Export/cleanup fails

**Fix Timeline:** Within 2 days

### P2 - Medium (Minor)
- Visual inconsistencies
- Missing tooltips
- Suboptimal UX
- Minor performance issues

**Fix Timeline:** Within 1 week

### P3 - Low (Nice-to-have)
- Cosmetic issues
- Enhancement requests
- Edge cases

**Fix Timeline:** Backlog

---

## 5. Test Metrics

### 5.1 Test Coverage Goals
- E2E Coverage: >80% of user workflows
- API Coverage: 100% of endpoints
- Manual Test Coverage: 100% of P0 features

### 5.2 Success Criteria
- Zero P0 bugs in production
- <5 P1 bugs per release
- All E2E tests pass before deployment
- No regressions on key workflows

---

## 6. Test Data

### 6.1 Sample Budgets
```json
[
  {
    "department": "Engineering",
    "subCategory": "Software",
    "fiscalPeriod": "FY2026",
    "budgetedAmount": 500000,
    "currency": "USD"
  },
  {
    "department": "Sales",
    "subCategory": "Software",
    "fiscalPeriod": "FY2026",
    "budgetedAmount": 200000,
    "currency": "USD"
  },
  {
    "department": "Marketing",
    "subCategory": "Advertising",
    "fiscalPeriod": "Q1-2026",
    "budgetedAmount": 50000,
    "currency": "USD"
  }
]
```

### 6.2 Test Users
- FP&A User: fpa@example.com
- Business User: business@example.com
- Finance Manager: finance@example.com

---

## 7. Known Issues & Limitations

### 7.1 Current Known Issues
- Local database connection requires manual setup
- Playwright installation requires disk space
- Test execution time ~60s for full suite

### 7.2 Future Improvements
- Add unit tests with Jest
- Add API integration tests
- Add performance monitoring
- Add automated accessibility tests (axe-core)
- Add visual regression tests (Percy/Chromatic)

---

## Document History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-02 | Claude Code | Initial test plan |
