# Budget Sync System - Engineering Integration Guide

**Audience:** Head of Engineering, Development Team
**Purpose:** Technical integration guide and architecture documentation

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Integration Points](#integration-points)
6. [Code Organization](#code-organization)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)

---

## System Overview

### What This System Does

**Core Functionality:**
1. Import budget data from multiple sources (Excel, CSV, SFTP, S3, Google Sheets)
2. AI-powered column mapping with fuzzy matching
3. File type validation (detects non-budget files like payroll/invoices)
4. Real-time budget availability check for approval workflows
5. Import history tracking and audit trail

**Key Features:**
- ✅ Smart file type detection (prevents wrong files)
- ✅ AI column mapping (handles typos, variations)
- ✅ Transaction-safe imports (rollback on error)
- ✅ Multi-source support (Excel, SFTP, S3, Sheets)
- ✅ Auto-approval rules (threshold-based)

### Technology Stack

```
Frontend:
├── Next.js 14 (App Router)
├── React 18
├── TypeScript
└── Tailwind CSS

Backend:
├── Next.js API Routes
├── Node.js 18+
└── Prisma ORM

Database:
└── PostgreSQL

File Processing:
├── xlsx (Excel parsing)
├── papaparse (CSV parsing)
└── ssh2-sftp-client (SFTP)

External Services:
├── AWS S3 (optional)
└── Google Sheets API (optional)
```

---

## Architecture

### High-Level Flow

```
┌─────────────────┐
│  User Uploads   │
│  Excel/CSV File │
└────────┬────────┘
         │
         ↓
┌────────────────────┐
│  AI Analysis       │
│  - Column mapping  │
│  - File type check │
│  - Validation      │
└────────┬───────────┘
         │
         ↓
┌────────────────────┐
│  User Reviews      │
│  - Adjust mappings │
│  - Confirm import  │
└────────┬───────────┘
         │
         ↓
┌────────────────────┐
│  Import Engine     │
│  - Transform data  │
│  - Bulk insert     │
│  - Transaction     │
└────────┬───────────┘
         │
         ↓
┌────────────────────┐
│  Database          │
│  - Budget records  │
│  - Import history  │
│  - Audit logs      │
└────────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────┐
│              Frontend (Next.js)             │
├─────────────────────────────────────────────┤
│  /fpa/import          - Visual mapper UI    │
│  /dashboard           - Budget dashboard    │
│  /test-import.html    - Testing interface   │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│            API Layer (Next.js API)          │
├─────────────────────────────────────────────┤
│  /api/excel/analyze   - File analysis       │
│  /api/excel/import    - Execute import      │
│  /api/budget/check    - Budget validation   │
│  /api/budgets         - CRUD operations     │
│  /api/imports/history - Import tracking     │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│          Business Logic Layer               │
├─────────────────────────────────────────────┤
│  lib/ai/mapping-engine.ts                   │
│    - AI column mapping                      │
│    - File type detection                    │
│    - Confidence scoring                     │
│                                              │
│  lib/sync/sync-engine.ts                    │
│    - Import orchestration                   │
│    - Data transformation                    │
│    - Error handling                         │
│                                              │
│  lib/sync/file-receiver.ts                  │
│    - SFTP polling                           │
│    - S3 file download                       │
│    - File parsing                           │
│                                              │
│  lib/approval/engine.ts                     │
│    - Auto-approval rules                    │
│    - Budget availability                    │
│    - Threshold checks                       │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│          Data Layer (Prisma)                │
├─────────────────────────────────────────────┤
│  Budget, BudgetUtilization,                 │
│  ImportHistory, BudgetDataSourceConfig      │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│            Database (PostgreSQL)            │
└─────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### Budget
```prisma
model Budget {
  id              String   @id @default(cuid())
  customerId      String
  department      String
  subCategory     String?
  fiscalPeriod    String
  budgetedAmount  Float
  currency        String   @default("USD")
  source          String   @default("manual")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  utilization     BudgetUtilization?
  customer        Customer  @relation(fields: [customerId], references: [id])

  @@index([customerId])
  @@index([department])
  @@index([fiscalPeriod])
  @@index([source])
  @@index([createdAt])
}
```

#### BudgetUtilization
```prisma
model BudgetUtilization {
  id              String   @id @default(cuid())
  budgetId        String   @unique
  committedAmount Float    @default(0)
  reservedAmount  Float    @default(0)
  actualSpent     Float    @default(0)
  updatedAt       DateTime @updatedAt

  budget          Budget   @relation(fields: [budgetId], references: [id])
}
```

#### ImportHistory
```prisma
model ImportHistory {
  id              String   @id @default(cuid())
  customerId      String
  fileName        String
  sourceType      String
  status          String
  totalRows       Int
  successRows     Int      @default(0)
  errorRows       Int      @default(0)
  errors          Json?
  createdAt       DateTime @default(now())
  completedAt     DateTime?

  customer        Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
  @@index([status])
  @@index([createdAt])
}
```

#### BudgetDataSourceConfig
```prisma
model BudgetDataSourceConfig {
  id              String   @id @default(cuid())
  customerId      String
  sourceType      String   // 'sftp' | 's3' | 'sheets'
  config          Json     // SFTP/S3/Sheets credentials
  schedule        String?  // Cron expression
  isActive        Boolean  @default(true)
  lastSyncAt      DateTime?
  createdAt       DateTime @default(now())

  customer        Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
  @@index([isActive])
}
```

### Relationships

```
Customer
  ├── Budget (1:N)
  ├── ImportHistory (1:N)
  └── BudgetDataSourceConfig (1:N)

Budget
  └── BudgetUtilization (1:1)
```

---

## API Endpoints

### 1. File Analysis API

**Endpoint:** `POST /api/excel/analyze`

**Purpose:** Analyze uploaded file, detect columns, suggest mappings

**Request:**
```typescript
FormData {
  file: File (CSV, Excel)
  userId: string (optional)
}
```

**Response:**
```typescript
{
  success: boolean
  fileName: string
  totalRows: number
  headers: string[]
  sampleRows: any[][]
  mappings: ColumnMapping[]
  fileTypeDetection: {
    likelyFileType: 'budget' | 'payroll' | 'expenses' | 'invoice'
    confidence: number
    budgetConfidence: number
    warnings: string[]
  }
  canProceed: boolean
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/excel/analyze \
  -F "file=@budget.csv" \
  -F "userId=user_123"
```

---

### 2. Import Execution API

**Endpoint:** `POST /api/excel/import`

**Purpose:** Execute budget import with confirmed mappings

**Request:**
```typescript
{
  customerId: string
  userId: string
  fileName: string
  mappings: {
    sourceColumn: string
    targetField: string
  }[]
  rows: any[][]
}
```

**Response:**
```typescript
{
  success: boolean
  importId: string
  imported: number
  errors: any[]
  stats: {
    totalRows: number
    successRows: number
    errorRows: number
  }
}
```

---

### 3. Budget Check API

**Endpoint:** `POST /api/budget/check`

**Purpose:** Check if budget is available for a purchase request

**Request:**
```typescript
{
  customerId: string
  department: string
  subCategory?: string
  fiscalPeriod: string
  amount: number
  currency?: string
}
```

**Response:**
```typescript
{
  success: boolean
  available: boolean
  budget: {
    id: string
    budgetedAmount: number
    committed: number
    reserved: number
    available: number
  }
  canAutoApprove: boolean
  autoApprovalThreshold: number
  utilizationPercent: number
  reason: string
}
```

**Example:**
```javascript
const response = await fetch('/api/budget/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerId: 'cust_123',
    department: 'Engineering',
    subCategory: 'Software',
    fiscalPeriod: 'FY2025',
    amount: 5000
  })
});

const result = await response.json();

if (result.available && result.canAutoApprove) {
  // Auto-approve the purchase
} else if (result.available) {
  // Requires manual approval
} else {
  // Reject - insufficient budget
}
```

---

### 4. Budget List API

**Endpoint:** `GET /api/budgets`

**Purpose:** Get budgets with optional filtering

**Query Parameters:**
```typescript
{
  customerId: string (required)
  importId?: string    // Filter by specific import
  source?: string      // Filter by source (excel, sftp, etc.)
  department?: string
}
```

**Response:**
```typescript
{
  success: boolean
  count: number
  budgets: Budget[]
  filters: {
    customerId: string
    importId?: string
    source?: string
  }
}
```

---

### 5. Import History API

**Endpoint:** `GET /api/imports/history`

**Purpose:** Get import history for a customer

**Query Parameters:**
```typescript
{
  customerId: string
  limit?: number (default: 50)
}
```

**Response:**
```typescript
{
  success: boolean
  imports: ImportHistory[]
}
```

---

## Integration Points

### 1. Integrating with Approval Workflows

**Scenario:** User creates a purchase request, system needs to check budget

```typescript
// In your purchase request handler
async function handlePurchaseRequest(request: PurchaseRequest) {
  // Step 1: Check budget availability
  const budgetCheck = await fetch('/api/budget/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: request.customerId,
      department: request.department,
      subCategory: request.category,
      fiscalPeriod: request.fiscalPeriod,
      amount: request.amount
    })
  });

  const result = await budgetCheck.json();

  // Step 2: Make decision based on result
  if (!result.available) {
    return {
      status: 'rejected',
      reason: result.reason
    };
  }

  if (result.canAutoApprove) {
    // Auto-approve and reserve budget
    await reserveBudget(result.budget.id, request.amount);
    return {
      status: 'approved',
      reason: 'Auto-approved - budget available'
    };
  }

  // Requires manual approval
  return {
    status: 'pending',
    reason: result.reason,
    requiresApprovalFrom: 'FP&A'
  };
}
```

---

### 2. Integrating with Dashboard

**Scenario:** Display budgets on existing dashboard

```typescript
// Fetch budgets for dashboard
async function loadDashboardBudgets(customerId: string) {
  const response = await fetch(
    `/api/budgets?customerId=${customerId}`
  );
  const data = await response.json();

  return data.budgets.map(budget => ({
    department: budget.department,
    category: budget.subCategory,
    budgeted: budget.budgetedAmount,
    available: calculateAvailable(budget),
    utilization: calculateUtilization(budget)
  }));
}

function calculateAvailable(budget: Budget) {
  const committed = budget.utilization?.committedAmount || 0;
  const reserved = budget.utilization?.reservedAmount || 0;
  return budget.budgetedAmount - committed - reserved;
}

function calculateUtilization(budget: Budget) {
  const committed = budget.utilization?.committedAmount || 0;
  const reserved = budget.utilization?.reservedAmount || 0;
  return ((committed + reserved) / budget.budgetedAmount) * 100;
}
```

---

### 3. Scheduled SFTP Sync

**Scenario:** Automatically sync budgets from customer SFTP daily

```typescript
// Set up cron job (e.g., using node-cron or Vercel cron)
import cron from 'node-cron';
import { fileReceiver } from '@/lib/sync/file-receiver';
import { syncEngine } from '@/lib/sync/sync-engine';

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Starting scheduled SFTP sync...');

  // Get all active SFTP configs
  const configs = await prisma.budgetDataSourceConfig.findMany({
    where: {
      sourceType: 'sftp',
      isActive: true
    }
  });

  for (const config of configs) {
    try {
      // Poll SFTP for new files
      const files = await fileReceiver.pollForNewFiles({
        type: 'sftp',
        config: config.config
      }, config.lastSyncAt);

      // Import each file
      for (const file of files) {
        await syncEngine.syncFromFile(config.customerId, file.filePath);
      }

      // Update last sync time
      await prisma.budgetDataSourceConfig.update({
        where: { id: config.id },
        data: { lastSyncAt: new Date() }
      });

    } catch (error) {
      console.error(`SFTP sync failed for ${config.customerId}:`, error);
      // Send alert to ops team
    }
  }
});
```

---

### 4. Webhook Integration

**Scenario:** Notify external systems when import completes

```typescript
// Add webhook to import completion
async function notifyImportComplete(importHistory: ImportHistory) {
  const webhookUrl = await getWebhookUrl(importHistory.customerId);

  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'budget.import.completed',
        customerId: importHistory.customerId,
        importId: importHistory.id,
        totalRows: importHistory.totalRows,
        successRows: importHistory.successRows,
        errorRows: importHistory.errorRows,
        timestamp: importHistory.completedAt
      })
    });
  }
}
```

---

## Code Organization

### File Structure

```
spendflo-budget-enhancements/
├── app/
│   ├── api/
│   │   ├── budget/
│   │   │   └── check/
│   │   │       └── route.ts          # Budget availability API
│   │   ├── budgets/
│   │   │   └── route.ts              # Budget CRUD
│   │   ├── excel/
│   │   │   ├── analyze/
│   │   │   │   └── route.ts          # File analysis
│   │   │   └── import/
│   │   │       └── route.ts          # Import execution
│   │   ├── imports/
│   │   │   └── history/
│   │   │       └── route.ts          # Import history
│   │   └── dashboard/
│   │       └── stats/
│   │           └── route.ts          # Dashboard stats
│   ├── fpa/
│   │   └── import/
│   │       └── page.tsx              # Visual mapper UI
│   └── dashboard/
│       └── page.tsx                  # Budget dashboard
│
├── lib/
│   ├── ai/
│   │   └── mapping-engine.ts         # AI column mapping
│   ├── sync/
│   │   ├── sync-engine.ts            # Import orchestration
│   │   └── file-receiver.ts          # SFTP/S3 handling
│   ├── approval/
│   │   └── engine.ts                 # Auto-approval logic
│   └── prisma.ts                     # Database client
│
├── prisma/
│   ├── schema.prisma                 # Database schema
│   └── migrations/                   # Migration history
│
├── public/
│   ├── test-import.html              # Testing interface
│   ├── test-budget-check.html        # Budget check tester
│   └── test-sync.html                # Quick upload test
│
└── test-data/
    ├── 1_standard_format.csv         # Test files
    ├── payroll_sample.csv
    └── ...
```

---

## Testing

### Automated Tests

**Run all tests:**
```bash
npm test
```

**File Type Detection Tests:**
```bash
python3 /tmp/test_detection.py
```

**Expected Results:**
- Budget file: ✅ PASS (no warnings)
- Payroll file: ✅ PASS (warning shown)
- Expenses file: ✅ PASS (warning shown)
- Invoice file: ✅ PASS (warning shown)

### Manual Testing

**Test Import Flow:**
```bash
1. Open http://localhost:3000/fpa/import
2. Upload test-data/1_standard_format.csv
3. Verify AI mappings are correct
4. Click "Import"
5. Verify success message
6. Check database: SELECT * FROM "Budget" ORDER BY "createdAt" DESC LIMIT 10;
```

**Test Budget Check API:**
```bash
# Get customer ID
CUSTOMER_ID=$(curl -s http://localhost:3000/api/seed | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Test budget check
curl -X POST http://localhost:3000/api/budget/check \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"department\": \"Engineering\",
    \"subCategory\": \"Software\",
    \"fiscalPeriod\": \"FY2025\",
    \"amount\": 5000
  }"
```

### Performance Testing

**Test Large Import:**
```bash
# Generate large test file
python3 scripts/generate_large_budget.py --rows 1000 > test-large.csv

# Time the import
time curl -X POST http://localhost:3000/api/sync/upload \
  -F "file=@test-large.csv" \
  -F "customerId=$CUSTOMER_ID"
```

**Expected Performance:**
- 100 rows: <5 seconds
- 1000 rows: <30 seconds
- Budget check API: <100ms

---

## Deployment

### Prerequisites

```bash
# Install dependencies
npm install

# Set environment variables
DATABASE_URL="postgresql://user:pass@host:5432/db"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="https://your-domain.com"

# Run migrations
npx prisma migrate deploy

# Build
npm run build
```

### Production Deployment

**Vercel:**
```bash
vercel --prod
```

**Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

**Manual:**
```bash
# Build
npm run build

# Start
NODE_ENV=production npm start
```

### Post-Deployment Verification

```bash
# Check health
curl https://your-domain.com/api/health

# Test import
curl -X POST https://your-domain.com/api/excel/analyze \
  -F "file=@test-data/1_standard_format.csv"

# Check database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Budget\";"
```

---

## Monitoring

### Key Metrics

**Application Metrics:**
```typescript
// Track these metrics
metrics.counter('budget.import.started');
metrics.counter('budget.import.succeeded');
metrics.counter('budget.import.failed');
metrics.histogram('budget.import.duration_ms');
metrics.counter('budget.check.requests');
metrics.histogram('budget.check.duration_ms');
metrics.counter('file.type.warning');
```

**Database Queries to Monitor:**
```sql
-- Import success rate
SELECT
  COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*) as success_rate
FROM "ImportHistory"
WHERE "createdAt" > NOW() - INTERVAL '24 hours';

-- Average import time
SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt"))) as avg_seconds
FROM "ImportHistory"
WHERE status = 'completed'
AND "createdAt" > NOW() - INTERVAL '24 hours';

-- File type warnings
SELECT sourceType, COUNT(*)
FROM "ImportHistory"
WHERE errors::text LIKE '%file type%'
GROUP BY sourceType;
```

### Alerts

**Set up alerts for:**
- Import failure rate > 10%
- API response time > 1 second
- SFTP connection failures > 3 in 1 hour
- Database query time > 5 seconds

### Logging

**Important log events:**
```typescript
// Import started
logger.info('Import started', {
  customerId,
  fileName,
  totalRows
});

// Import completed
logger.info('Import completed', {
  customerId,
  importId,
  successRows,
  errorRows,
  durationMs
});

// File type warning
logger.warn('Non-budget file detected', {
  customerId,
  fileName,
  detectedType,
  confidence
});

// Budget check
logger.info('Budget check', {
  customerId,
  department,
  amount,
  available,
  canAutoApprove
});
```

---

## Troubleshooting

### Common Issues

#### 1. Import Fails with "Transaction timeout"

**Cause:** Large file taking > 60 seconds to import

**Fix:**
```typescript
// Increase timeout in sync-engine.ts
await prisma.$transaction(async (tx) => {
  // ... import logic
}, { timeout: 120000 }); // 2 minutes
```

#### 2. SFTP Connection Fails

**Diagnostics:**
```bash
# Test SFTP manually
sftp username@hostname
ls /remote/path

# Check credentials
node -e "
const Client = require('ssh2-sftp-client');
const sftp = new Client();
sftp.connect({
  host: 'hostname',
  username: 'user',
  password: 'pass'
}).then(() => console.log('Connected')).catch(console.error);
"
```

**Common fixes:**
- Verify firewall allows port 22
- Check credentials are correct
- Ensure SSH key has correct permissions (600)
- Verify remote path exists

#### 3. File Type Detection Incorrect

**Cause:** File has unusual column names

**Fix:**
```typescript
// Add custom keywords in mapping-engine.ts
const FILE_TYPE_KEYWORDS = {
  budget: [
    ...existing,
    'custom-budget-term',  // Add customer-specific terms
  ]
};
```

#### 4. Budget Check Returns Wrong Result

**Diagnostics:**
```sql
-- Check budget data
SELECT * FROM "Budget"
WHERE "customerId" = 'cust_123'
AND "department" = 'Engineering'
AND "fiscalPeriod" = 'FY2025';

-- Check utilization
SELECT b.*, u.*
FROM "Budget" b
LEFT JOIN "BudgetUtilization" u ON u."budgetId" = b.id
WHERE b."customerId" = 'cust_123';
```

---

## Performance Optimization

### Database Indexes

**Critical indexes:**
```sql
CREATE INDEX idx_budget_customer ON "Budget"("customerId");
CREATE INDEX idx_budget_department ON "Budget"("department");
CREATE INDEX idx_budget_period ON "Budget"("fiscalPeriod");
CREATE INDEX idx_budget_source ON "Budget"("source");
CREATE INDEX idx_budget_created ON "Budget"("createdAt");
```

### Query Optimization

**Slow query:**
```typescript
// Bad - loads all budgets
const budgets = await prisma.budget.findMany({
  where: { customerId }
});
```

**Optimized:**
```typescript
// Good - paginated with select
const budgets = await prisma.budget.findMany({
  where: { customerId },
  select: {
    id: true,
    department: true,
    fiscalPeriod: true,
    budgetedAmount: true,
    utilization: {
      select: {
        committedAmount: true,
        reservedAmount: true
      }
    }
  },
  take: 100,
  skip: page * 100
});
```

### Caching

**Cache budget check results:**
```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.REDIS_URL });

async function checkBudget(params) {
  const cacheKey = `budget:${params.customerId}:${params.department}:${params.fiscalPeriod}`;

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  // Compute result
  const result = await computeBudgetCheck(params);

  // Cache for 5 minutes
  await redis.set(cacheKey, result, { ex: 300 });

  return result;
}
```

---

## Security Checklist

- [ ] All API endpoints require authentication
- [ ] Customer data isolation enforced (WHERE customerId = ?)
- [ ] File upload size limited (10MB recommended)
- [ ] SQL injection protection verified
- [ ] XSS protection enabled
- [ ] SFTP/S3 credentials encrypted in database
- [ ] Sensitive logs masked
- [ ] Rate limiting enabled on APIs
- [ ] CORS configured correctly
- [ ] HTTPS enforced in production

---

## Support Contacts

**Engineering:**
- Team Lead: [Name/Email]
- On-call: [Rotation schedule]

**Database:**
- DBA: [Name/Email]

**Infrastructure:**
- DevOps: [Name/Email]

---

## Additional Resources

- **API Documentation:** See COMPLETE_CONTEXT.md
- **Budget Check Guide:** See BUDGET_CHECK_API_GUIDE.md
- **SFTP Setup:** See SFTP_QUICK_CHECK.md
- **Customer Guide:** See CUSTOMER_FACING_GUIDE.md
