# Budget Data Source Connector Architecture

**Version:** 1.0
**Date:** February 2026
**Status:** Google Sheets ✅ Live | Anaplan/Prophix 🔨 Coming Soon

---

## 🎯 Vision

Enable customers to maintain budgets in **their system of choice** while SpendFlo reads budget data in real-time for intake approvals.

**Key Principles:**
1. **Read-only access** - Never write back to customer systems
2. **Pluggable architecture** - Easy to add new FP&A tools
3. **AI-powered mapping** - Automatically detect customer's data structure
4. **Real-time checks** - Query live data on every budget check
5. **Performance** - Smart caching to avoid API rate limits

---

## 🏗️ Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SpendFlo Workflow                        │
│                  (Intake Request Comes In)                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              POST /api/budget/check                         │
│              (Budget Check API Endpoint)                    │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                  Budget Data Router                         │
│         (Routes query to correct data source)               │
└────┬────────┬────────┬────────┬─────────┬──────────────────┘
     │        │        │        │         │
     ↓        ↓        ↓        ↓         ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌──────────┐
│ Google │ │Internal│ │Anaplan │ │Prophix│ │ Custom   │
│ Sheets │ │Database│ │ (Soon) │ │(Soon) │ │API (Soon)│
│Connector│ │Connector│ │Connector│ │Connector│ │Connector │
└────┬───┘ └────┬───┘ └────┬───┘ └───┬──┘ └────┬─────┘
     │          │          │         │         │
     ↓          ↓          ↓         ↓         ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌──────────┐
│Customer│ │SpendFlo│ │Anaplan │ │Prophix│ │Customer  │
│ Sheet  │ │   DB   │ │  API   │ │  API  │ │   API    │
└────────┘ └────────┘ └────────┘ └──────┘ └──────────┘
```

---

## 📦 Core Components

### 1. **BudgetDataSource** (Abstract Base Class)

Defines the contract all connectors must implement:

```typescript
abstract class BudgetDataSource {
  // Find specific budget
  abstract findBudget(query: BudgetQuery): Promise<BudgetRecord | null>;

  // Get all budgets
  abstract getAllBudgets(customerId: string): Promise<BudgetRecord[]>;

  // Test connection
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;

  // Discover and map schema
  abstract discoverSchema(): Promise<SchemaInfo>;

  // Check if read-only
  abstract isReadOnly(): boolean;

  // Display info
  abstract getDisplayName(): string;
  abstract getIcon(): string;
}
```

**Why abstract class?**
- Enforces consistent interface across all connectors
- Easy to add new FP&A tools
- Type safety in TypeScript

---

### 2. **BudgetDataRouter** (Query Router)

Routes budget queries to the correct data source for each customer.

```typescript
class BudgetDataRouter {
  async checkBudget(query: BudgetQuery): Promise<BudgetCheckResult> {
    // 1. Look up customer's configured data source
    const dataSource = this.getDataSource(query.customerId);

    // 2. Query that data source
    const budget = await dataSource.findBudget(query);

    // 3. Calculate availability
    const available = budget.budgetedAmount - budget.committed - budget.reserved;

    // 4. Return result
    return { available: available > 0, budget, ... };
  }
}
```

**Key Features:**
- Single entry point for all budget queries
- Automatically uses correct connector per customer
- Handles errors gracefully
- Returns standardized result format

---

### 3. **Connector Implementations**

#### Google Sheets Connector ✅ (Live)

```typescript
class GoogleSheetsBudgetConnector extends BudgetDataSource {
  // Connects via OAuth
  // Reads customer's sheet in real-time
  // AI maps columns
  // Caches for 5 minutes (configurable)
}
```

**Features:**
- OAuth 2.0 authentication
- Real-time data fetch via Google Sheets API
- AI-powered column mapping
- Smart caching (5 min default, configurable)
- Read-only (never modifies customer's sheet)

---

#### Internal Database Connector ✅ (Live)

```typescript
class InternalBudgetConnector extends BudgetDataSource {
  // Queries SpendFlo's Prisma database
  // Used for customers who upload Excel/CSV
  // Supports write operations (reserve/commit/release)
}
```

**Features:**
- Fast (local database)
- Full read/write support
- Utilization tracking (committed/reserved)
- Default option for uploaded budgets

---

#### Future Connectors 🔨 (Coming Soon)

**Anaplan Connector:**
- Connect to Anaplan workspace/model
- Query budget modules via Anaplan API
- Map dimensions to our fields

**Prophix Connector:**
- Connect to Prophix database/cube
- Query via REST API
- Map dimensions to our fields

**Adaptive Insights Connector:**
- OAuth to Workday Adaptive Planning
- Query account structure
- Map accounts to our fields

**Custom API Connector:**
- Customer provides their own budget API
- We map JSON response to our fields
- Fully customizable

---

## 🔄 Complete Workflow: Google Sheets Integration

### Phase 1: Setup (One-Time)

```
1. Customer clicks "Connect Google Sheets"
   ↓
2. OAuth flow → Customer authorizes SpendFlo (read-only)
   ↓
3. Customer selects spreadsheet from their Drive
   ↓
4. Customer selects sheet tab (e.g., "FY2025 Budget")
   ↓
5. AI analyzes sheet structure
   POST /api/connectors/discover-schema
   {
     spreadsheetId: "abc123",
     sheetName: "FY2025 Budget"
   }
   ↓
6. AI returns suggested column mappings
   {
     "Dept" → "department" (95% confidence)
     "Fiscal Year" → "fiscalPeriod" (90% confidence)
     "Budget" → "budgetedAmount" (85% confidence)
   }
   ↓
7. Customer reviews and confirms mappings
   (Can manually adjust if AI got something wrong)
   ↓
8. Save configuration
   POST /api/connectors/setup-google-sheets
   {
     customerId: "cust123",
     spreadsheetId: "abc123",
     sheetName: "FY2025 Budget",
     columnMappings: { "Dept": "department", ... }
   }
   ↓
9. Test connection and fetch sample data
   ↓
10. Connector is LIVE! ✅
```

### Phase 2: Runtime (Every Budget Check)

```
1. User submits intake request in SpendFlo workflow
   {
     vendor: "Salesforce",
     amount: 50000,
     department: "Sales"
   }
   ↓
2. SpendFlo calls budget check API
   POST /api/budget/check
   {
     customerId: "cust123",
     department: "Sales",
     fiscalPeriod: "FY2025",  ← Auto-calculated
     amount: 50000
   }
   ↓
3. Budget Data Router checks cache
   ├─ Cache valid (< 5 min old) → Use cached data ⚡
   └─ Cache expired → Fetch fresh data from Google Sheet
      ↓
      Google Sheets API query
      ↓
      Parse rows using saved column mappings
      ↓
      Transform to BudgetRecord format
      ↓
      Update cache
   ↓
4. Find matching budget
   department: "Sales"
   fiscalPeriod: "FY2025"
   subCategory: null (or specified)
   ↓
5. Calculate availability
   Available = Budgeted - Committed - Reserved
   Note: For Google Sheets, committed/reserved always = 0
         (Read-only, no utilization tracking)
   ↓
6. Return result to SpendFlo workflow
   {
     available: true,
     budget: { budgetedAmount: 500000, ... },
     reason: "Budget available: $500,000",
     source: "Google Sheets",
     cachedData: true
   }
   ↓
7. SpendFlo workflow proceeds with approval
```

---

## 💾 Caching Strategy

### Why Cache?

**Problem:** Hitting Google Sheets API on every budget check is:
- Slow (200-500ms per request)
- Rate-limited (100 requests/100 seconds/user)
- Expensive (quota limits)

**Solution:** Smart caching

### Cache Implementation

```typescript
interface CachedBudgetData {
  budgets: BudgetRecord[];
  timestamp: Date;
  ttl: number; // seconds
}

// Check cache first
if (cache && isCacheValid()) {
  return cache.budgets; // Fast! ⚡
}

// Cache expired or missing → Fetch fresh data
const budgets = await fetchFromGoogleSheets();
cache = { budgets, timestamp: now(), ttl: 300 }; // 5 min
return budgets;
```

### Cache TTL (Time-To-Live)

**Default:** 5 minutes (300 seconds)
**Configurable:** Customer can set 1-60 minutes

**Rationale:**
- Budgets don't change frequently (usually monthly/quarterly updates)
- 5 minutes provides good balance of freshness vs. performance
- For frequently changing budgets, use shorter TTL

### Cache Invalidation

**Automatic:**
- After TTL expires
- On error (falls back to stale cache if available)

**Manual:**
- Customer can click "Refresh Budget Data" in UI
- Calls `connector.invalidateCache()`

---

## 🔐 Read-Only Guarantee

### Why Read-Only?

1. **Customer trust** - Never modify their source of truth
2. **Data integrity** - No risk of corrupting their budgets
3. **Compliance** - Some orgs prohibit external writes
4. **Simplicity** - Easier to implement and secure

### How It Works

**Google Sheets OAuth Scope:**
```typescript
scope: 'https://www.googleapis.com/auth/spreadsheets.readonly'
//                                                   ^^^^^^^^
//                                                   Read-only!
```

**Connector Interface:**
```typescript
isReadOnly(): boolean {
  return true; // External connectors are read-only
}

updateUtilization(...): Promise<Result> {
  return { success: false, error: 'This data source is read-only' };
}
```

### Implication: No Utilization Tracking

**For Google Sheets (and future external connectors):**
- Cannot track committed amounts
- Cannot track reserved amounts
- Budget check only verifies: "Does budget exist? What's the total?"

**Workaround:**
Customer has 2 options:
1. **Accept limitation** - Budget checks only verify budget exists
2. **Hybrid approach** - Keep budget amounts in Google Sheets, track utilization in SpendFlo

**Future Enhancement:** Dual-source architecture
- Budget amounts from Google Sheets
- Utilization tracking in SpendFlo database
- Combined view for accurate availability

---

## 🧪 Testing & Validation

### Connection Testing

Every connector implements `testConnection()`:

```typescript
// Google Sheets
await connector.testConnection();
// → Tries to read spreadsheet metadata
// → Returns { success: true } or { success: false, error: "..." }

// Anaplan (future)
await connector.testConnection();
// → Verifies OAuth token, workspace access, model exists

// Prophix (future)
await connector.testConnection();
// → Checks API key, database access
```

**When tests run:**
1. During initial setup (before saving config)
2. On connector manager initialization (app startup)
3. On manual "Test Connection" button click

---

## 🎨 User Experience Flow

### Setup UI Flow

```
┌─────────────────────────────────────────────────┐
│  Choose Budget Data Source                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  ○ SpendFlo Database (Upload Excel/CSV)        │
│     🗄️ Upload files to SpendFlo               │
│                                                 │
│  ● Google Sheets                                │
│     📊 Connect to your Google Sheet            │
│     [Connect with Google] button                │
│                                                 │
│  ○ Anaplan (Coming Soon)                        │
│     📈 Connect to Anaplan models               │
│                                                 │
│  ○ Prophix (Coming Soon)                        │
│     💼 Connect to Prophix budgets              │
│                                                 │
└─────────────────────────────────────────────────┘

      ↓ (User selects Google Sheets)

┌─────────────────────────────────────────────────┐
│  Connect to Google Sheets                       │
├─────────────────────────────────────────────────┤
│  [Continue with Google] OAuth button            │
│                                                 │
│  ✓ Read-only access                            │
│  ✓ We never modify your sheets                 │
│  ✓ You can disconnect anytime                  │
└─────────────────────────────────────────────────┘

      ↓ (OAuth completes)

┌─────────────────────────────────────────────────┐
│  Select Budget Spreadsheet                      │
├─────────────────────────────────────────────────┤
│  Search: [_____________________________] 🔍     │
│                                                 │
│  ○ Q1 2025 Planning                             │
│  ● FY2025 Master Budget ✅                      │
│  ○ Department Budgets 2025                      │
│  ○ Finance Model v3                             │
│                                                 │
│  [Next →]                                       │
└─────────────────────────────────────────────────┘

      ↓

┌─────────────────────────────────────────────────┐
│  Select Sheet Tab                               │
├─────────────────────────────────────────────────┤
│  Spreadsheet: FY2025 Master Budget              │
│                                                 │
│  ○ Instructions                                 │
│  ● Budget Summary ✅                            │
│  ○ Department Details                           │
│  ○ Archive                                      │
│                                                 │
│  [Next →]                                       │
└─────────────────────────────────────────────────┘

      ↓ (AI analyzes structure)

┌─────────────────────────────────────────────────┐
│  Review Column Mappings                         │
├─────────────────────────────────────────────────┤
│  AI detected your budget structure:             │
│                                                 │
│  Your Column       →  Our Field      Confidence │
│  ─────────────────────────────────────────────  │
│  ✅ "Dept"         →  Department     95% ✏️    │
│  ✅ "Fiscal Year"  →  Fiscal Period  90% ✏️    │
│  ✅ "Budget"       →  Budget Amount  85% ✏️    │
│  ⚠️  "Category"    →  Sub-Category   60% ✏️    │
│  ❓ "Notes"        →  (Not mapped)        ➕    │
│                                                 │
│  Preview (first 3 rows):                        │
│  Dept    | Fiscal Year | Budget   | Category   │
│  Sales   | FY2025     | 500000   | Tools       │
│  Eng     | FY2025     | 800000   | Software    │
│  ...                                            │
│                                                 │
│  [← Back] [Confirm & Activate →]               │
└─────────────────────────────────────────────────┘

      ↓

┌─────────────────────────────────────────────────┐
│  ✅ Google Sheets Connected!                    │
├─────────────────────────────────────────────────┤
│  Successfully connected to:                     │
│  📊 FY2025 Master Budget → Budget Summary       │
│                                                 │
│  Found 12 budgets:                              │
│  • Sales - FY2025 - $500,000                    │
│  • Engineering - FY2025 - $800,000              │
│  • Marketing - FY2025 - $300,000                │
│  ...                                            │
│                                                 │
│  Budget checks will now use your Google Sheet  │
│  in real-time. Data refreshes every 5 minutes.  │
│                                                 │
│  [View All Budgets] [Done]                      │
└─────────────────────────────────────────────────┘
```

---

## 🚀 Adding a New Connector

### Step-by-Step Guide

#### 1. Create Connector Class

```typescript
// lib/connectors/anaplan-connector.ts
import { BudgetDataSource, ... } from './budget-data-source';

export class AnaplanBudgetConnector extends BudgetDataSource {
  async findBudget(query: BudgetQuery): Promise<BudgetRecord | null> {
    // 1. Build Anaplan API query
    // 2. Execute via Anaplan SDK
    // 3. Transform response to BudgetRecord
  }

  // ... implement all required methods
}
```

#### 2. Register in Connector Manager

```typescript
// lib/connectors/connector-manager.ts
switch (config.type) {
  case 'anaplan':
    connector = new AnaplanBudgetConnector(config);
    break;
  // ...
}
```

#### 3. Add Setup API Endpoint

```typescript
// app/api/connectors/setup-anaplan/route.ts
export async function POST(req: NextRequest) {
  // Handle Anaplan-specific setup
}
```

#### 4. Create UI Components

```typescript
// app/components/connectors/AnaplanSetup.tsx
// OAuth flow, model selection, mapping UI
```

#### 5. Test & Document

- Write unit tests
- Test with real Anaplan account
- Document setup process
- Add to connector list UI

---

## 📊 Performance Considerations

### Google Sheets Connector

| Scenario | Without Cache | With Cache (5 min) |
|----------|---------------|---------------------|
| First request | 300-500ms | 300-500ms |
| Subsequent requests (< 5 min) | 300-500ms | 5-10ms ⚡ |
| API quota usage (100 req/day) | All quota used | 1-2% quota used |

**Recommendation:** Use default 5-minute cache for production.

---

## 🔒 Security Considerations

### OAuth Token Storage

**Google Sheets:**
- Access token: Encrypted in database
- Refresh token: Encrypted in database
- Scope: Read-only (`.readonly`)
- Automatic refresh when expired

### API Keys (Future Connectors)

**Anaplan/Prophix:**
- Store encrypted in database
- Never log in plaintext
- Rotate regularly
- Revoke on connector disconnect

### Data Access

**Customer data never leaves their system except:**
- Temporary cache in SpendFlo (5-60 minutes)
- Query results returned to workflow
- Audit logs (metadata only, no budget amounts)

---

## 📝 Configuration Storage

### Database Schema (To Add)

```prisma
model BudgetDataSourceConfig {
  id             String    @id @default(cuid())
  customerId     String    @unique
  type           String    // 'google_sheets', 'internal', 'anaplan', etc.
  enabled        Boolean   @default(true)
  credentials    Json?     // Encrypted OAuth/API tokens
  columnMappings Json?     // { "Dept": "department", ... }
  sourceConfig   Json?     // Connector-specific config
  cacheTTL       Int       @default(300)
  lastSyncedAt   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  customer Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
}
```

---

## 🎯 Roadmap

### Phase 1: Google Sheets ✅ (Current)
- [x] Connector architecture
- [x] Google Sheets connector
- [x] Internal database connector
- [x] Budget data router
- [x] AI column mapping
- [x] Setup UI flow
- [x] Caching

### Phase 2: Anaplan & Prophix 🔨 (Q2 2026)
- [ ] Anaplan OAuth integration
- [ ] Anaplan API connector
- [ ] Prophix API connector
- [ ] Setup UI for both
- [ ] Documentation

### Phase 3: Enhanced Features 🔮 (Q3 2026)
- [ ] Hybrid mode (budget from Google Sheets + utilization in SpendFlo)
- [ ] Custom API connector
- [ ] Webhook notifications (budget changes)
- [ ] Multi-source aggregation
- [ ] Advanced caching strategies

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue:** "Failed to connect to Google Sheet"
**Solution:**
1. Verify OAuth is still authorized
2. Check spreadsheet still exists
3. Re-authorize if needed

**Issue:** "No budget found" but budget exists in sheet
**Solution:**
1. Check fiscal period format matches
2. Verify department name exact match
3. Invalidate cache and retry

**Issue:** "Connector not initialized"
**Solution:**
1. Check customer has configured connector
2. Restart app to trigger initialization
3. Manually call `connectorManager.initializeConnector(customerId)`

---

## 🎓 Best Practices

### For Customers

1. **Keep budget sheets simple**
   - Clear column headers
   - No merged cells
   - Consistent formats

2. **Don't rename columns frequently**
   - Breaks saved mappings
   - Requires reconfiguration

3. **Use standard fiscal period formats**
   - FY2025, Q1-2025, etc.
   - Matches SpendFlo's auto-calculation

### For Developers

1. **Always implement caching**
   - External APIs are slow
   - Respect rate limits

2. **Handle auth token refresh**
   - OAuth tokens expire
   - Auto-refresh transparently

3. **Return helpful errors**
   - Users need context
   - Suggest fixes

4. **Log everything**
   - Debugging connector issues is hard
   - Include customer context

---

**Questions or feedback?** Contact Engineering Team.
