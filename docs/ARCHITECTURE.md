# SpendFlo Budget Service - Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Component Architecture](#component-architecture)
5. [Data Flow](#data-flow)
6. [Database Schema](#database-schema)
7. [API Design](#api-design)
8. [Frontend Architecture](#frontend-architecture)
9. [Deployment Architecture](#deployment-architecture)
10. [Scalability Considerations](#scalability-considerations)
11. [Security Architecture](#security-architecture)

---

## System Overview

SpendFlo Budget Service is a full-stack budget management application designed to integrate with SpendFlo's workflow engine. It provides real-time budget tracking, availability checks, and comprehensive audit logging.

### Key Characteristics
- **Architecture**: Serverless Next.js (App Router) with API routes
- **Database**: PostgreSQL with Prisma ORM
- **Deployment**: Railway (containerized)
- **API Style**: RESTful JSON APIs
- **Authentication**: Currently open (ready for integration)
- **Multi-tenancy**: Customer-based isolation

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Dashboard  │  │  FP&A Upload │  │ Request Form │         │
│  │   (React)    │  │   (React)    │  │   (React)    │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                  │                  │
│         └─────────────────┴──────────────────┘                  │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│                      Next.js 16 (App Router)                    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                    API Routes                          │   │
│  │                                                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │ /api/budget/ │  │ /api/budgets │  │ /api/upload │ │   │
│  │  │   - check    │  │   - GET      │  │   - POST    │ │   │
│  │  │   - reserve  │  │   - POST     │  │             │ │   │
│  │  │   - commit   │  │   - PATCH    │  └─────────────┘ │   │
│  │  │   - release  │  │   - DELETE   │                  │   │
│  │  │   - status   │  └──────────────┘                  │   │
│  │  └──────────────┘                                     │   │
│  │                                                         │   │
│  │  ┌──────────────┐  ┌──────────────┐                  │   │
│  │  │ /api/dashboard│ │ /api/audit   │                  │   │
│  │  │   - stats    │  │   - GET      │                  │   │
│  │  └──────────────┘  └──────────────┘                  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                Business Logic Layer                    │   │
│  │                                                         │   │
│  │  • Budget calculation engine                           │   │
│  │  • Currency conversion                                 │   │
│  │  • Excel parsing (XLSX)                                │   │
│  │  • Audit trail generation                              │   │
│  │  • Health status computation                           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATA ACCESS LAYER                         │
├─────────────────────────────────────────────────────────────────┤
│                       Prisma ORM                                │
│                                                                 │
│  • Connection pooling                                           │
│  • Query optimization                                           │
│  • Transaction management                                       │
│  • Type-safe database access                                    │
│                                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATABASE LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                  PostgreSQL (Neon Serverless)                   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Customer │  │  Budget  │  │  Budget  │  │  Audit   │      │
│  │          │  │          │  │  Util.   │  │   Log    │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                                                 │
│  ┌──────────┐  ┌──────────┐                                   │
│  │   User   │  │ Request  │                                   │
│  │          │  │          │                                   │
│  └──────────┘  └──────────┘                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
- **Framework**: Next.js 16.1.6 (React 19)
- **Routing**: App Router (server components)
- **Styling**: Tailwind CSS 3.4
- **UI Components**: Custom components with Heroicons
- **State Management**: React hooks (useState, useEffect)
- **Forms**: Native HTML forms with validation
- **File Upload**: Drag-and-drop with file validation

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Next.js API Routes
- **ORM**: Prisma 5.22
- **File Processing**: Formidable (multipart/form-data)
- **Excel Parsing**: XLSX library
- **Validation**: Custom validators

### Database
- **Engine**: PostgreSQL 15+
- **Provider**: Neon (serverless PostgreSQL)
- **Connection**: Pooled connections via Prisma
- **Backup**: Neon automatic backups
- **SSL**: Required for all connections

### DevOps
- **Hosting**: Railway (containerized deployment)
- **CI/CD**: Git-based auto-deployment
- **Monitoring**: Railway logs + custom health endpoint
- **Testing**: Playwright E2E tests
- **Linting**: ESLint with Next.js config

### Key Dependencies
```json
{
  "next": "16.1.6",
  "react": "19.0.0",
  "prisma": "5.22.0",
  "@prisma/client": "5.22.0",
  "tailwindcss": "3.4.17",
  "xlsx": "0.18.5",
  "formidable": "3.5.2"
}
```

---

## Component Architecture

### 1. Client Components (Frontend)

```
app/
├── page.tsx                    # Homepage (role-based navigation)
├── dashboard/
│   ├── page.tsx               # Server wrapper
│   └── DashboardClient.tsx    # Client component
├── business/
│   └── request-v2/
│       └── page.tsx           # Budget request form
├── fpa/
│   └── upload/
│       └── page.tsx           # Excel upload UI
└── components/
    ├── Toast.tsx              # Notification system
    ├── BudgetEditModal.tsx    # Budget editing
    ├── ReleaseBudgetModal.tsx # Budget release
    ├── ExportButton.tsx       # CSV export
    └── Header.tsx             # Navigation header
```

### 2. API Routes (Backend)

```
app/api/
├── budget/
│   ├── check/route.ts         # Budget availability check
│   ├── reserve/route.ts       # Reserve budget (soft lock)
│   ├── commit/route.ts        # Commit budget (hard lock)
│   ├── release/route.ts       # Release budget
│   └── status/[id]/route.ts   # Get budget status
├── budgets/
│   ├── route.ts               # GET all, POST new
│   └── [id]/route.ts          # PATCH update, DELETE
├── dashboard/
│   └── stats/route.ts         # Aggregated metrics
├── upload-budget/
│   └── route.ts               # Excel file upload
├── audit/
│   └── route.ts               # Audit log retrieval
└── test/
    └── route.ts               # Health check
```

### 3. Database Models

```typescript
// Core Models
- Customer      // Multi-tenant customer
- User          // System users (FP&A, admins)
- Budget        // Department budgets
- BudgetUtilization  // Committed/reserved tracking
- AuditLog      // Immutable change history
- Request       // Purchase requests
```

---

## Data Flow

### Budget Check Flow

```
1. User enters request details
   ↓
2. Frontend validates fields
   ↓
3. POST /api/budget/check
   ↓
4. API finds matching budget
   ↓
5. Calculate: available = budgeted - committed - reserved
   ↓
6. Return availability status
   ↓
7. Frontend shows banner (green/red)
```

### Budget Reserve Flow

```
1. User submits request
   ↓
2. POST /api/budget/reserve
   ↓
3. Start database transaction
   ↓
4. Lock budget row
   ↓
5. Check availability
   ↓
6. Update reserved amount
   ↓
7. Create audit log
   ↓
8. Commit transaction
   ↓
9. Return success
```

### Excel Upload Flow

```
1. User drops Excel file
   ↓
2. Frontend sends to /api/upload-budget
   ↓
3. Server parses Excel with XLSX
   ↓
4. Validate each row:
   - Required fields
   - Data types
   - Business rules
   ↓
5. For each budget:
   - Check if exists (upsert)
   - Validate amount (cannot reduce below committed+reserved)
   - Update or create budget
   - Create audit log
   ↓
6. Return summary (created/updated counts)
   ↓
7. Frontend shows results
```

### Dashboard Stats Flow

```
1. Dashboard loads
   ↓
2. Parallel API calls:
   - GET /api/dashboard/stats
   - GET /api/budgets
   ↓
3. Server aggregates:
   - Total budget
   - Total committed
   - Total reserved
   - Health status counts
   ↓
4. Calculate utilization %
   ↓
5. Identify critical budgets (>90%)
   ↓
6. Return JSON
   ↓
7. Frontend renders cards and charts
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐
│  Customer   │
│─────────────│
│ id (PK)     │
│ name        │
│ domain      │───┐
│ createdAt   │   │
│ updatedAt   │   │
└─────────────┘   │
                  │ 1:N
                  │
        ┌─────────┴──────────┬───────────────┐
        │                    │               │
        ▼                    ▼               ▼
┌─────────────┐      ┌─────────────┐   ┌─────────────┐
│    User     │      │   Budget    │   │  Request    │
│─────────────│      │─────────────│   │─────────────│
│ id (PK)     │      │ id (PK)     │   │ id (PK)     │
│ email       │      │ customerId  │   │ customerId  │
│ name        │      │ department  │   │ supplier    │
│ role        │      │ subCategory │   │ description │
│ customerId  │      │ fiscalPeriod│   │ amount      │
└─────────────┘      │ budgetAmount│   │ status      │
                     │ currency    │   │ budgetId    │
                     │ createdAt   │   │ createdById │
                     └──────┬──────┘   └─────────────┘
                            │
                            │ 1:1
                            │
                     ┌──────┴──────┐
                     │             │
                     ▼             ▼
            ┌──────────────┐  ┌──────────────┐
            │   Budget     │  │  AuditLog    │
            │ Utilization  │  │──────────────│
            │──────────────│  │ id (PK)      │
            │ id (PK)      │  │ budgetId     │
            │ budgetId     │  │ action       │
            │ committed    │  │ oldValue     │
            │ reserved     │  │ newValue     │
            │ updatedAt    │  │ changedBy    │
            └──────────────┘  │ reason       │
                              │ createdAt    │
                              └──────────────┘
```

### Schema Details

**Customer**
```prisma
model Customer {
  id        String    @id @default(cuid())
  name      String
  domain    String    @unique
  createdAt DateTime  @default(now())
  updatedAt DateTime  @default(now())
  budgets   Budget[]
  Request   Request[]
  User      User[]
}
```

**Budget**
```prisma
model Budget {
  id             String             @id @default(cuid())
  customerId     String
  department     String
  subCategory    String?
  fiscalPeriod   String
  budgetedAmount Float
  source         String             @default("manual")
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @default(now()) @updatedAt
  currency       String             @default("USD")

  auditLogs      AuditLog[]
  customer       Customer           @relation(fields: [customerId], references: [id])
  utilization    BudgetUtilization? @relation("BudgetToUtilization")
  Request        Request[]

  @@unique([customerId, department, subCategory, fiscalPeriod])
}
```

**BudgetUtilization**
```prisma
model BudgetUtilization {
  id              String   @id @default(cuid())
  budgetId        String   @unique
  committedAmount Float    @default(0)
  reservedAmount  Float    @default(0)
  updatedAt       DateTime @default(now())
  Budget          Budget   @relation("BudgetToUtilization", fields: [budgetId], references: [id])
}
```

**AuditLog**
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  budgetId  String
  action    String
  oldValue  String?
  newValue  String?
  changedBy String
  reason    String?
  createdAt DateTime @default(now())
  budget    Budget   @relation(fields: [budgetId], references: [id])
}
```

---

## API Design

### RESTful Principles
- **Resource-based URLs**: `/api/budget/check`, `/api/budgets/{id}`
- **HTTP Methods**: GET (read), POST (create/action), PATCH (update), DELETE (remove)
- **Status Codes**: 200 (success), 400 (bad request), 404 (not found), 500 (error)
- **JSON Format**: All requests and responses use JSON

### API Versioning
- Currently v1 (implicit)
- Future versions can use `/api/v2/...`

### Request/Response Format
```typescript
// Standard Success Response
{
  success: boolean,
  data: object,
  message?: string
}

// Standard Error Response
{
  error: string,
  details?: string,
  code?: number
}
```

### Budget State Machine

```
Available Budget
      ↓
   [RESERVE] ──────→ Reserved
      ↓                 ↓
   [COMMIT] ←──────────┘
      ↓
  Committed
      ↓
   [RELEASE]
      ↓
Available Budget
```

### Idempotency
- All write operations accept `requestId` for idempotency
- Duplicate requests with same `requestId` return cached response

---

## Frontend Architecture

### Component Hierarchy

```
Page (Server Component)
└── ClientComponent
    ├── useState/useEffect
    ├── API calls
    ├── Toast notifications
    └── Child components
        ├── Forms
        ├── Modals
        └── Tables
```

### State Management
- **Local State**: React useState for form inputs
- **Server State**: Fetch API with loading/error states
- **Optimistic Updates**: Update UI before server confirmation
- **Error Boundaries**: Graceful error handling

### Validation Strategy
- **Client-side**: Immediate feedback on form inputs
- **Server-side**: Final validation before database operations
- **Inline Errors**: Show errors next to invalid fields
- **Status Banners**: Prominent feedback for budget checks

### Performance Optimizations
- **Server Components**: Static rendering where possible
- **Code Splitting**: Dynamic imports for large components
- **Image Optimization**: Next.js Image component
- **CSS Optimization**: Tailwind CSS purging

---

## Deployment Architecture

### Railway Infrastructure

```
┌─────────────────────────────────────────┐
│          Railway Platform               │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │     Next.js Application          │  │
│  │  (Container: Node 18)            │  │
│  │                                   │  │
│  │  • Auto-scaling                   │  │
│  │  • Zero-downtime deployments     │  │
│  │  • Health checks                  │  │
│  │  • Log aggregation               │  │
│  └───────────┬──────────────────────┘  │
│              │                          │
│              │ TCP/IP                   │
│              ▼                          │
│  ┌──────────────────────────────────┐  │
│  │    PostgreSQL (Neon)             │  │
│  │                                   │  │
│  │  • Pooled connections            │  │
│  │  • SSL encryption                │  │
│  │  • Automatic backups             │  │
│  │  • Point-in-time recovery        │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
         ▲
         │ HTTPS
         │
┌────────┴─────────┐
│   Cloudflare     │
│   (CDN + SSL)    │
└──────────────────┘
```

### Deployment Process

1. **Git Push** → Push to `main` branch
2. **Railway Webhook** → Triggers build
3. **Docker Build** → Creates container image
4. **Database Migration** → Runs `prisma db push`
5. **Health Check** → Verifies `/api/test` endpoint
6. **Traffic Switch** → Routes traffic to new deployment
7. **Old Instance** → Gracefully shut down

### Environment Configuration

```bash
# Railway Environment Variables
DATABASE_URL=postgresql://...
NODE_ENV=production
PORT=8080
```

### Startup Script (start.sh)

```bash
#!/bin/bash
echo "Running database migrations..."
npx prisma db push --accept-data-loss

echo "Starting Next.js server..."
npm start
```

---

## Scalability Considerations

### Current Limitations
- **Single Region**: Deployed in one Railway region
- **Single Database**: One PostgreSQL instance
- **No Caching**: Direct database queries
- **No Queue**: Synchronous processing

### Scaling Strategy

#### Horizontal Scaling
```
Load Balancer
    ↓
┌───────┬───────┬───────┐
│ App 1 │ App 2 │ App 3 │  (Railway auto-scaling)
└───┬───┴───┬───┴───┬───┘
    └───────┼───────┘
            ↓
     PostgreSQL
   (Connection Pool)
```

#### Vertical Scaling
- **Database**: Neon auto-scales compute
- **Application**: Railway increases container resources

#### Performance Optimizations
1. **Database Indexing**
   ```sql
   CREATE INDEX idx_budget_lookup ON budgets(customerId, department, fiscalPeriod);
   CREATE INDEX idx_utilization_budget ON budget_utilization(budgetId);
   ```

2. **Connection Pooling**
   - Prisma connection limit: 10
   - Neon serverless pooling

3. **API Response Caching**
   - Cache dashboard stats (5 min TTL)
   - Cache budget lookups (1 min TTL)

4. **Database Query Optimization**
   - Use `include` for joins
   - Limit result sets
   - Use aggregation queries

---

## Security Architecture

### Current Security Measures

1. **Database Security**
   - SSL-only connections (`sslmode=require`)
   - Credential rotation via Railway
   - Connection string in environment variables

2. **API Security**
   - HTTPS only (enforced by Railway)
   - Input validation on all endpoints
   - SQL injection prevention (Prisma parameterized queries)

3. **Frontend Security**
   - XSS prevention (React escaping)
   - CSRF protection (SameSite cookies)
   - Content Security Policy headers

### Planned Security Enhancements

1. **Authentication**
   ```typescript
   // Planned: JWT-based authentication
   middleware: [
     validateToken,
     checkPermissions,
     rateLimiting
   ]
   ```

2. **Authorization**
   - Role-based access control (RBAC)
   - Customer-level isolation
   - API key authentication for integrations

3. **Audit & Compliance**
   - Immutable audit logs
   - Sensitive data encryption
   - GDPR compliance (data export/deletion)

4. **Rate Limiting**
   ```typescript
   // Planned: Per-customer rate limits
   limits: {
     check: 100/min,
     reserve: 50/min,
     commit: 30/min
   }
   ```

---

## Monitoring & Observability

### Logging
- **Application Logs**: Railway log aggregation
- **Database Logs**: Neon query logs
- **Audit Logs**: Database table (immutable)

### Metrics (Planned)
- Request rate
- Response times
- Error rates
- Database query performance
- Budget utilization trends

### Health Checks
- `/api/test` endpoint
- Database connectivity check
- Response time monitoring

### Alerting (Planned)
- Critical budget alerts (>90%)
- API error spikes
- Database connection failures
- Deployment failures

---

## Technology Decisions

### Why Next.js?
- ✅ Full-stack framework (frontend + API)
- ✅ Server-side rendering for SEO
- ✅ API routes for backend logic
- ✅ Built-in optimizations
- ✅ Active ecosystem

### Why Prisma?
- ✅ Type-safe database access
- ✅ Automatic migrations
- ✅ Excellent developer experience
- ✅ Connection pooling
- ✅ Query optimization

### Why PostgreSQL?
- ✅ ACID compliance
- ✅ JSON support
- ✅ Strong consistency
- ✅ Mature ecosystem
- ✅ Excellent for financial data

### Why Railway?
- ✅ Simple deployment
- ✅ Auto-scaling
- ✅ Integrated PostgreSQL
- ✅ Zero-config SSL
- ✅ Git-based CI/CD

---

## Future Architecture Improvements

1. **Microservices**
   - Separate budget service from frontend
   - Event-driven architecture
   - Message queue (RabbitMQ/SQS)

2. **Caching Layer**
   - Redis for frequently accessed data
   - Cache invalidation strategy
   - Session management

3. **Real-time Updates**
   - WebSocket connections
   - Server-Sent Events
   - Live dashboard updates

4. **Advanced Analytics**
   - Data warehouse (Snowflake/BigQuery)
   - Business intelligence dashboards
   - Predictive analytics

5. **Multi-region Deployment**
   - Geographic distribution
   - Database replication
   - CDN optimization

---

## Glossary

- **Budget**: Allocated funds for a department/category
- **Committed**: Hard-locked budget (approved spend)
- **Reserved**: Soft-locked budget (pending approval)
- **Available**: Free budget for new requests
- **Fiscal Period**: Time period for budget (FY2025, Q1-2025)
- **Utilization**: Percentage of budget consumed
- **Audit Log**: Immutable record of changes

---

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Railway Documentation](https://docs.railway.app)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)
