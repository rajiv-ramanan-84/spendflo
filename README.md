# SpendFlo Budget Service

A lightweight budget management service designed for integration with SpendFlo's workflow engine.

## Features

### For FP&A Users
- **Excel Upload**: Drag-and-drop Excel files to bulk import/update budgets
- **Change Tracking**: Auto-detects create vs update operations
- **Validation**: Cannot reduce budgets below committed + reserved amounts
- **Currency Support**: USD and GBP with automatic conversion

### For Workflow Integration
- **5 Core APIs**: check, reserve, commit, release, status
- **Budget States**: Total = Committed + Reserved + Available
- **Audit Trail**: Complete history of all changes
- **Health Monitoring**: Real-time utilization alerts

### Dashboard
- **Budget Health**: Visual health metrics (healthy, warning, high-risk, critical)
- **Utilization Tracking**: Department-level utilization percentages
- **Critical Alerts**: Automatic flagging of budgets >90% utilized

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Railway account (for deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/rajiv-ramanan-84/spendflo.git
   cd spendflo-budget
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create `.env.local` with your database URL:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/budget_db"
   ```

4. **Initialize database**
   ```bash
   npx prisma db push
   npx prisma db seed  # Optional: Load sample data
   ```

5. **Run development server**
   ```bash
   npm run dev
   ```

6. **Open in browser**
   Navigate to http://localhost:3000

### Deployment to Railway

This project is configured for automatic deployment to Railway.

1. **Connect GitHub repository** to Railway
2. **Add PostgreSQL service** to your Railway project
3. **Set environment variables** in Railway:
   - `DATABASE_URL`: Automatically set by Railway PostgreSQL plugin
4. **Deploy**: Push to `main` branch triggers automatic deployment
5. **Database migration**: Runs automatically on first start via `start.sh`

## Project Structure

```
spendflo-budget/
├── app/
│   ├── page.tsx                    # Homepage with role-based tiles
│   ├── dashboard/page.tsx          # Budget health dashboard
│   ├── fpa/upload/page.tsx         # Excel upload interface
│   ├── test/page.tsx               # API testing console
│   ├── audit/page.tsx              # Audit log viewer
│   └── api/
│       ├── budget/
│       │   ├── check/route.ts      # Check budget availability
│       │   ├── reserve/route.ts    # Reserve budget (soft hold)
│       │   ├── commit/route.ts     # Commit budget (hard lock)
│       │   ├── release/route.ts    # Release budget
│       │   └── status/[id]/route.ts # Get budget status
│       ├── dashboard/stats/route.ts # Dashboard metrics
│       └── upload-budget/route.ts   # Excel upload handler
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── seed.ts                     # Sample data
├── public/
│   └── sample-budget-template.xlsx # Excel template for FP&A
├── API_DOCUMENTATION.md            # Complete API reference
└── start.sh                        # Railway startup script
```

## Usage

### 1. Homepage
Visit the homepage to access three main areas:
- **Budget Dashboard**: View budget health and utilization
- **FP&A User**: Upload budgets via Excel
- **Test API**: Interactive API testing console

### 2. FP&A Workflow

#### Upload Budgets
1. Download the sample template from `/fpa/upload`
2. Fill in budget data:
   - **Department**: Required (e.g., "Engineering", "Sales")
   - **SubCategory**: Optional (e.g., "Software", "Hardware")
   - **FiscalPeriod**: Required (e.g., "FY2025", "Q1-2025")
   - **BudgetedAmount**: Required (numeric, e.g., 500000)
   - **Currency**: Required (USD or GBP)
3. Upload the Excel file
4. Review import results (created vs updated)
5. Check audit log for changes

#### Excel File Format
```
Department | SubCategory | FiscalPeriod | BudgetedAmount | Currency
Engineering | Software   | FY2025       | 500000         | USD
Sales       | Tools      | FY2025       | 250000         | USD
```

### 3. API Integration

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference.

#### Quick Example
```javascript
// Check if budget is available
const response = await fetch('https://your-app.railway.app/api/budget/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customerId: 'customer-id',
    department: 'Engineering',
    subCategory: 'Software',
    fiscalPeriod: 'FY2025',
    amount: 10000,
    currency: 'USD'
  })
});

const result = await response.json();
// { isAvailable: true, available: 200000, ... }
```

### 4. Dashboard

View real-time budget health:
- **Total Budget**: Sum of all budgeted amounts
- **Committed**: Hard-locked spend (approved purchases)
- **Reserved**: Soft-locked spend (pending approvals)
- **Available**: Free budget for new requests
- **Health Status**: Color-coded categories
  - 🟢 Healthy: <70% utilized
  - 🟡 Warning: 70-80% utilized
  - 🟠 High Risk: 80-90% utilized
  - 🔴 Critical: >90% utilized

### 5. Audit Log

Track all budget changes at `/audit`:
- CREATE: New budget added
- UPDATE: Budget amount changed
- RESERVE: Budget soft-locked
- COMMIT: Budget hard-locked
- RELEASE: Budget released

Each entry includes:
- Timestamp
- Action type
- Budget details
- Old/new values
- Changed by (user/system)
- Reason

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS
- **Excel**: XLSX library
- **File Upload**: Formidable
- **Deployment**: Railway

## Configuration

### Database Schema

The service uses the following models:
- **Customer**: Multi-tenant support
- **User**: FP&A users and admins
- **Budget**: Department budgets by fiscal period
- **BudgetUtilization**: Committed/reserved tracking
- **AuditLog**: Immutable change history

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (required)
- `NODE_ENV`: production | development (auto-set by Railway)

## API Reference

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for:
- Complete endpoint documentation
- Request/response examples
- Error handling
- Workflow integration guide

## Design System

Matches SpendFlo branding:
- **Primary Color**: Pink (#E91E63)
- **Typography**: Clean, modern sans-serif
- **Layout**: Card-based, rounded corners
- **Icons**: Heroicons (outline style)

## Development

### Build
```bash
npm run build
```

### Lint
```bash
npm run lint
```

### Database Management
```bash
npx prisma studio          # Open database GUI
npx prisma db push         # Sync schema to database
npx prisma migrate dev     # Create migration
npx prisma generate        # Generate Prisma client
```

### Seed Database
```bash
npm run seed
```

Creates:
- 1 customer (Acme Corporation)
- 2 users (admin, manager)
- 3 budgets with utilization
- 2 sample requests

## Roadmap

Future enhancements:
- [ ] Authentication & authorization
- [ ] Multi-tenant isolation
- [ ] Budget forecasting
- [ ] Email notifications for critical budgets
- [ ] Reservation expiry (48-hour auto-release)
- [ ] Bulk budget operations
- [ ] Advanced reporting
- [ ] Budget version history
- [ ] Custom fiscal periods
- [ ] More currencies

## 📚 Comprehensive Documentation

This project includes extensive documentation for technical and business stakeholders:

### For CTOs & Technical Leadership
- **[Executive Summary](./docs/EXECUTIVE_SUMMARY.md)** - High-level overview, metrics, ROI
- **[Architecture Documentation](./docs/ARCHITECTURE.md)** - System design, diagrams, tech stack
- **[Security Documentation](./docs/SECURITY.md)** - Security posture, compliance, roadmap

### For Engineers
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Local setup, production deployment, troubleshooting
- **[API Documentation](./API_DOCUMENTATION.md)** - Complete API reference with examples
- **[Test Plan](./docs/TEST_PLAN.md)** - Test cases, quality assurance strategy

### For Product Managers
- **[Product Requirements](./docs/PRD.md)** - Complete functional requirements (64 FRs)

## 📊 Project Status

**Production URL**: https://spendflo-production.up.railway.app

| Metric | Status |
|--------|--------|
| Test Coverage | ✅ 9/9 E2E tests passing |
| Documentation | ✅ 75+ pages complete |
| Deployment | ✅ Auto-deploy on push |
| Security | ⚠️ MVP (auth planned Q1 2026) |
| Performance | ✅ <200ms response time |

## Support

For issues or questions:
- Check `/test` page for API testing
- Review `/audit` for change history
- View `/dashboard` for budget health
- Read comprehensive docs in `/docs` folder
- Open GitHub issue

## License

MIT

## Acknowledgments

Built with Claude Code for SpendFlo budget management.
