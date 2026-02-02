# Product Requirements Document (PRD)
## SpendFlo Budget Management Service

**Version:** 1.0
**Last Updated:** February 2, 2026
**Owner:** Product & Engineering

---

## 1. Executive Summary

### 1.1 Product Overview
SpendFlo Budget Management Service is a lightweight, API-first budget validation and tracking system designed to integrate with SpendFlo's existing workflow engine. It enables real-time budget checking, reservation, and commitment for procurement requests while providing comprehensive budget management capabilities for FP&A teams.

### 1.2 Problem Statement
Organizations need a centralized system to:
- Track departmental budgets across fiscal periods
- Validate purchase requests against available budgets in real-time
- Prevent budget overruns through reservation and commitment workflows
- Provide audit trails for all budget-related transactions
- Enable FP&A teams to manage budgets efficiently

### 1.3 Success Criteria
- 100% of purchase requests validated against budget before approval
- Zero budget overruns due to system failures
- <2 second response time for budget check API
- Complete audit trail for all budget modifications
- FP&A team can upload/modify budgets in <5 minutes

---

## 2. User Personas

### 2.1 FP&A User (Primary Admin)
**Role:** Financial Planning & Analysis team member
**Responsibilities:**
- Upload and maintain departmental budgets via Excel
- Monitor budget utilization across departments
- Release stuck/reserved budgets when requests are canceled
- Export budget data for reporting
- Clean up duplicate budget entries

**Pain Points:**
- Manual budget tracking in spreadsheets
- No real-time visibility into budget utilization
- Difficulty tracking reserved vs. committed amounts

### 2.2 Business User (Requester)
**Role:** Department employee submitting purchase requests
**Responsibilities:**
- Submit purchase requests with vendor, amount, and purpose
- Receive instant feedback on budget availability
- Understand which department's budget will be used

**Pain Points:**
- Uncertainty about budget availability
- Lengthy approval processes due to budget checks
- Lack of visibility into department budgets

### 2.3 SpendFlo Workflow Engine (System User)
**Role:** Automated system making API calls
**Responsibilities:**
- Check budget availability before routing requests
- Reserve budget during approval workflow
- Commit budget when purchase is approved
- Release budget if request is rejected

---

## 3. Features & Requirements

### 3.1 Budget Management (FP&A)

#### 3.1.1 Excel Upload
**Priority:** P0 (Critical)

**Requirements:**
- FR-001: System SHALL accept Excel files (.xlsx, .xls) with budget data
- FR-002: System SHALL validate required columns: Department, Sub-Category, Fiscal Period, Budgeted Amount, Currency
- FR-003: System SHALL support USD and GBP currencies only
- FR-004: System SHALL create new budgets if they don't exist
- FR-005: System SHALL update existing budgets (matched by Department + Sub-Category + Fiscal Period)
- FR-006: System SHALL NOT allow reducing budget below (Committed + Reserved) amounts
- FR-007: System SHALL log all changes with user attribution
- FR-008: System SHALL display success/failure summary after upload

**User Flow:**
1. FP&A user clicks "Upload Budgets" from homepage
2. Selects Excel file from computer
3. System validates file structure
4. System processes each row, creating/updating budgets
5. System shows summary: X budgets created, Y updated, Z failed
6. Failed imports show specific error messages

#### 3.1.2 Dashboard
**Priority:** P0 (Critical)

**Requirements:**
- FR-009: System SHALL display summary metrics: Total Budget, Committed, Reserved, Available
- FR-010: System SHALL show overall utilization percentage with color coding:
  - Green: <70% utilized (Healthy)
  - Yellow: 70-80% (Warning)
  - Orange: 80-90% (High Risk)
  - Red: >90% (Critical)
- FR-011: System SHALL list critical budgets (>90% utilized) prominently
- FR-012: System SHALL display all budgets in searchable table
- FR-013: System SHALL show per-budget breakdown: Department, Sub-Category, Period, Currency, Amounts
- FR-014: System SHALL allow editing budgets via modal (NOT inline for now)
- FR-015: System SHALL allow releasing reserved/committed amounts manually
- FR-016: System SHALL allow deleting budgets (only if no commitments)
- FR-017: System SHALL provide Export to Excel functionality
- FR-018: System SHALL provide duplicate cleanup tool
- FR-019: System SHALL load within 3 seconds even with empty/failing database

**UI Requirements:**
- UR-001: Dashboard SHALL use white background with clean, modern design
- UR-002: Dashboard SHALL NOT have "Add Budget" button (budgets only via upload)
- UR-003: Dashboard SHALL show loading state while fetching data
- UR-004: Dashboard SHALL show friendly empty state if no budgets exist
- UR-005: Dashboard SHALL display error message if APIs fail

### 3.2 Budget Request (Business User)

#### 3.2.1 Request Form
**Priority:** P0 (Critical)

**Requirements:**
- FR-020: System SHALL collect: Vendor, Purpose, Amount, Contract Term, Department
- FR-021: System SHALL NOT require Fiscal Period (auto-calculated from contract term)
- FR-022: Contract Term options: Monthly, Annual, One-time
- FR-023: System SHALL auto-calculate fiscal period:
  - Monthly → Current quarter (Q1-2026, Q2-2026, etc.)
  - Annual/One-time → Current fiscal year (FY2026)
- FR-024: Department field SHALL be searchable dropdown
- FR-025: System SHALL show all departments immediately when dropdown opens
- FR-026: System SHALL filter departments as user types
- FR-027: System SHALL suggest department based on vendor name
- FR-028: System SHALL check budget availability in real-time (500ms debounce)
- FR-029: System SHALL display budget status: Available/Insufficient with details
- FR-030: System SHALL show: Request Amount, Budget Available, Current Utilization, New Utilization
- FR-031: System SHALL disable submit if budget unavailable
- FR-032: System SHALL reserve budget upon successful submission
- FR-033: System SHALL display success message with reserved amount

**UI Requirements:**
- UR-006: Form SHALL use white background (matching app theme)
- UR-007: All text SHALL be dark color on white background (readable)
- UR-008: Form SHALL have clean, modern design with proper spacing
- UR-009: Department dropdown SHALL open immediately on click
- UR-010: Form SHALL show visual feedback for budget check (spinner)
- UR-011: Form SHALL use color coding: Green (available), Red (insufficient)

**User Flow:**
1. Business user clicks "Request Budget" from homepage
2. Enters vendor name (e.g., "Salesforce")
3. System suggests department (e.g., "Sales") - user can override
4. Enters purpose (e.g., "Annual CRM subscription")
5. Selects contract term (Annual)
6. Enters amount ($50,000)
7. Selects department from searchable dropdown
8. System checks budget availability in real-time
9. Shows available budget and utilization
10. User submits if available
11. Budget is reserved for 48 hours

### 3.3 API Integration

#### 3.3.1 Budget Check API
**Endpoint:** `POST /api/budget/check`
**Priority:** P0 (Critical)

**Request:**
```json
{
  "department": "Engineering",
  "subCategory": "Software", // optional
  "fiscalPeriod": "FY2026",
  "amount": 50000,
  "currency": "USD"
}
```

**Response (Success):**
```json
{
  "isAvailable": true,
  "budgetId": "clx123",
  "budgetDetails": {
    "totalBudget": 500000,
    "committed": 200000,
    "reserved": 50000,
    "available": 250000,
    "utilizationPercent": 50,
    "newUtilizationPercent": 60
  }
}
```

**Response (Insufficient):**
```json
{
  "isAvailable": false,
  "reason": "Insufficient budget. Available: $10,000, Requested: $50,000",
  "budgetId": "clx123",
  "budgetDetails": { ... }
}
```

**Requirements:**
- FR-034: API SHALL respond within 2 seconds
- FR-035: API SHALL match budget by Department + Fiscal Period (Sub-Category optional)
- FR-036: API SHALL check: (Budgeted Amount - Committed - Reserved) >= Requested Amount
- FR-037: API SHALL return budget details even if insufficient
- FR-038: API SHALL handle missing budgets gracefully

#### 3.3.2 Reserve Budget API
**Endpoint:** `POST /api/budget/reserve`
**Priority:** P0 (Critical)

**Request:**
```json
{
  "budgetId": "clx123",
  "amount": 50000,
  "requestId": "req-12345",
  "userId": "user@company.com",
  "reason": "Salesforce Annual License"
}
```

**Response:**
```json
{
  "success": true,
  "reservationId": "clx456",
  "expiresAt": "2026-02-04T12:00:00Z"
}
```

**Requirements:**
- FR-039: API SHALL create utilization record with reservedAmount
- FR-040: Reservation SHALL expire after 48 hours if not committed
- FR-041: API SHALL return error if budget insufficient
- FR-042: API SHALL be idempotent (same requestId returns same result)
- FR-043: API SHALL log action in audit trail

#### 3.3.3 Commit Budget API
**Endpoint:** `POST /api/budget/commit`
**Priority:** P0 (Critical)

**Request:**
```json
{
  "budgetId": "clx123",
  "amount": 50000,
  "requestId": "req-12345",
  "userId": "user@company.com",
  "reason": "Salesforce purchase approved"
}
```

**Requirements:**
- FR-044: API SHALL move amount from reserved to committed
- FR-045: API SHALL accept amount even if not previously reserved
- FR-046: API SHALL return error if budget insufficient
- FR-047: API SHALL log action in audit trail

#### 3.3.4 Release Budget API
**Endpoint:** `POST /api/budget/release`
**Priority:** P0 (Critical)

**Request:**
```json
{
  "budgetId": "clx123",
  "amount": 50000,
  "releaseType": "reserved|committed|both",
  "requestId": "req-12345",
  "userId": "user@company.com",
  "reason": "Request canceled"
}
```

**Requirements:**
- FR-048: API SHALL reduce reserved and/or committed amounts
- FR-049: API SHALL allow partial releases
- FR-050: API SHALL log action in audit trail

#### 3.3.5 Budget Status API
**Endpoint:** `GET /api/budget/status/:requestId`
**Priority:** P1 (High)

**Response:**
```json
{
  "requestId": "req-12345",
  "budgetId": "clx123",
  "status": "reserved|committed|released",
  "amount": 50000,
  "timestamp": "2026-02-02T12:00:00Z"
}
```

### 3.4 Navigation & Information Architecture

#### 3.4.1 Navigation Structure
**Requirements:**
- FR-051: System SHALL have single top navigation bar
- FR-052: Navigation SHALL include: Home, Budgets, New Request
- FR-053: System SHALL NOT have redundant links (no Quick Links section)
- FR-054: "Budgets" link SHALL go to /dashboard
- FR-055: "New Request" link SHALL go to /business/request-v2

#### 3.4.2 Redirects
**Requirements:**
- FR-056: /budgets SHALL redirect to /dashboard
- FR-057: /requests/new SHALL redirect to /business/request-v2
- FR-058: /business/request SHALL redirect to /business/request-v2

### 3.5 Audit & Logging

#### 3.5.1 Audit Trail
**Priority:** P1 (High)

**Requirements:**
- FR-059: System SHALL log all budget modifications
- FR-060: System SHALL log all API actions (reserve, commit, release)
- FR-061: Audit log SHALL include: Timestamp, User, Action, Old Value, New Value, Reason
- FR-062: Audit log SHALL be immutable
- FR-063: System SHALL provide audit log viewer
- FR-064: Audit log SHALL be searchable by date, user, budget

---

## 4. Non-Functional Requirements

### 4.1 Performance
- NFR-001: API response time SHALL be <2 seconds (p95)
- NFR-002: Dashboard load time SHALL be <3 seconds
- NFR-003: System SHALL handle 100 concurrent API requests
- NFR-004: Excel upload SHALL process 1000 rows in <10 seconds

### 4.2 Reliability
- NFR-005: System SHALL have 99.5% uptime
- NFR-006: Database connection failures SHALL NOT crash the application
- NFR-007: Dashboard SHALL show empty state gracefully if database unavailable
- NFR-008: Failed uploads SHALL provide clear error messages

### 4.3 Security
- NFR-009: System SHALL validate all user inputs
- NFR-010: System SHALL prevent SQL injection
- NFR-011: System SHALL log all user actions with attribution
- NFR-012: API endpoints SHALL validate request schemas

### 4.4 Usability
- NFR-013: System SHALL use consistent white background theme
- NFR-014: All text SHALL have WCAG AA contrast ratios
- NFR-015: Forms SHALL provide real-time validation feedback
- NFR-016: Error messages SHALL be actionable and user-friendly
- NFR-017: System SHALL work on desktop browsers (Chrome, Safari, Firefox)

### 4.5 Data
- NFR-018: System SHALL support USD and GBP currencies only
- NFR-019: Budget amounts SHALL be stored as numbers with 2 decimal precision
- NFR-020: System SHALL prevent duplicate budgets (Department + SubCategory + Period + Customer)

---

## 5. Out of Scope

The following features are explicitly OUT OF SCOPE for v1.0:

- OS-001: Multi-currency conversion and exchange rates
- OS-002: Budget forecasting and predictions
- OS-003: Approval workflows (handled by SpendFlo workflow engine)
- OS-004: Email notifications
- OS-005: User authentication and authorization
- OS-006: Multi-tenant support (beyond basic customer model)
- OS-007: Budget templates
- OS-008: Recurring budget adjustments
- OS-009: Integration with accounting systems
- OS-010: Mobile app

---

## 6. Technical Architecture

### 6.1 Technology Stack
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL (Railway)
- **ORM:** Prisma
- **Deployment:** Railway (auto-deploy from GitHub)
- **Testing:** Playwright (E2E)

### 6.2 Database Schema

```prisma
model Customer {
  id      String   @id @default(cuid())
  name    String
  domain  String?
  budgets Budget[]
}

model Budget {
  id              String      @id @default(cuid())
  customerId      String
  customer        Customer    @relation(fields: [customerId], references: [id])
  department      String
  subCategory     String?
  fiscalPeriod    String
  budgetedAmount  Float
  currency        String      @default("USD")
  utilization     Utilization?
  auditLogs       AuditLog[]

  @@unique([customerId, department, subCategory, fiscalPeriod])
}

model Utilization {
  id               String  @id @default(cuid())
  budgetId         String  @unique
  budget           Budget  @relation(fields: [budgetId], references: [id])
  committedAmount  Float   @default(0)
  reservedAmount   Float   @default(0)
}

model AuditLog {
  id        String   @id @default(cuid())
  budgetId  String
  budget    Budget   @relation(fields: [budgetId], references: [id])
  action    String
  oldValue  String?
  newValue  String?
  changedBy String
  reason    String?
  createdAt DateTime @default(now())
}
```

### 6.3 API Design Principles
- RESTful endpoints
- JSON request/response
- HTTP status codes: 200 (success), 400 (bad request), 404 (not found), 500 (server error)
- Idempotent operations where possible
- Detailed error messages in development, generic in production

---

## 7. Success Metrics

### 7.1 KPIs
- Budget check API success rate: >99.9%
- Average dashboard load time: <2s
- Budget overruns prevented: 100%
- FP&A upload success rate: >95%
- User satisfaction: >4/5

### 7.2 Analytics to Track
- API call volume by endpoint
- Budget utilization trends
- Most requested departments
- Failed request reasons
- Upload error patterns

---

## 8. Launch Plan

### 8.1 Phase 1: MVP (Current)
- Excel upload ✓
- Dashboard with metrics ✓
- Budget request form ✓
- 5 core APIs ✓
- Basic navigation ✓

### 8.2 Phase 2: Enhancements (Future)
- Advanced filtering and search
- Budget comparison over time
- Utilization alerts
- Batch operations
- Enhanced reporting

### 8.3 Phase 3: Integration (Future)
- SSO integration
- Webhook notifications
- Accounting system sync
- Advanced permissions

---

## 9. Appendices

### 9.1 Glossary
- **Budget:** Allocated amount for a department/category/period
- **Committed:** Amount that has been approved and locked
- **Reserved:** Amount that is temporarily held during approval
- **Available:** Budgeted - Committed - Reserved
- **Utilization:** Percentage of budget used (Committed + Reserved) / Budgeted
- **Fiscal Period:** Time period for budget (FY2026, Q1-2026, etc.)

### 9.2 References
- Railway Design System
- SpendFlo Brand Guidelines
- WCAG 2.1 AA Standards

---

## Document History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-02 | Claude Code | Initial PRD |
