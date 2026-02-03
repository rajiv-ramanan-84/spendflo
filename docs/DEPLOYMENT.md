# SpendFlo Budget Service - Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Database Management](#database-management)
5. [Environment Configuration](#environment-configuration)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### System Requirements
- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Git**: Latest version
- **PostgreSQL**: 15.x or higher (for local development)

### Accounts Required
- **GitHub**: For code repository
- **Railway**: For production hosting
- **Neon**: For PostgreSQL database (optional, can use Railway PostgreSQL)

---

## Local Development Setup

### Step 1: Clone Repository

```bash
# Clone the repository
git clone https://github.com/rajiv-ramanan-84/spendflo.git
cd spendflo-budget

# Verify Node version
node --version  # Should be 18.x or higher
```

### Step 2: Install Dependencies

```bash
# Install all dependencies
npm install

# This installs:
# - Next.js framework
# - Prisma ORM
# - Tailwind CSS
# - XLSX parser
# - All other dependencies
```

### Step 3: Database Setup

#### Option A: Local PostgreSQL

```bash
# Install PostgreSQL (macOS)
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb budget_db

# Create .env.local file
cat > .env.local << EOF
DATABASE_URL="postgresql://localhost:5432/budget_db?schema=public"
EOF
```

#### Option B: Neon (Recommended)

1. Go to [Neon Console](https://console.neon.tech)
2. Create new project "SpendFlo Budget"
3. Copy connection string
4. Create `.env.local`:

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/neondb?sslmode=require"
```

### Step 4: Initialize Database

```bash
# Push schema to database
npx prisma db push

# Generate Prisma client
npx prisma generate

# Seed with sample data (optional)
npx prisma db seed
```

Expected output:
```
Seeding database...
Created customer: Acme Corporation
Created users: Admin User Finance Manager
Created budgets: Engineering Sales Marketing
Created budget utilization records
Created sample requests
✅ Seeding complete!
```

### Step 5: Start Development Server

```bash
# Start Next.js dev server
npm run dev
```

Open browser to: http://localhost:3000

You should see the homepage with three tiles.

### Step 6: Verify Setup

Test all endpoints:

```bash
# Health check
curl http://localhost:3000/api/test

# Dashboard stats
curl http://localhost:3000/api/dashboard/stats

# Budget list
curl http://localhost:3000/api/budgets
```

---

## Production Deployment

### Deployment to Railway

#### Step 1: Prepare Repository

```bash
# Ensure all changes are committed
git add .
git commit -m "Prepare for deployment"
git push origin main
```

#### Step 2: Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize GitHub and select `rajiv-ramanan-84/spendflo` repository
5. Railway will auto-detect Next.js project

#### Step 3: Add PostgreSQL Database

##### Option A: Railway PostgreSQL (Simple)

1. In Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway automatically sets `DATABASE_URL` environment variable
4. Wait for database to provision

##### Option B: Neon (Recommended)

1. Create database in [Neon Console](https://console.neon.tech)
2. Copy connection string
3. In Railway, go to project → Variables tab
4. Add variable:
   ```
   DATABASE_URL=postgresql://user:password@host.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

#### Step 4: Configure Environment Variables

In Railway Variables tab, ensure:

```bash
# Required
DATABASE_URL=<your-database-url>

# Optional (auto-set by Railway)
NODE_ENV=production
PORT=8080
```

#### Step 5: Deploy

1. Railway automatically starts build after connecting repository
2. Build process:
   - Install dependencies (`npm install`)
   - Build Next.js (`npm run build`)
   - Run database migrations (`npx prisma db push`)
   - Start server (`npm start`)

3. Monitor deployment logs in Railway dashboard

#### Step 6: Seed Production Database

```bash
# Option 1: Via Railway CLI
railway run npx prisma db seed

# Option 2: Via Railway web interface
# Go to project → Settings → Deploy → Run Command
# Enter: npx prisma db seed
```

#### Step 7: Verify Deployment

```bash
# Get deployment URL from Railway
export RAILWAY_URL=https://your-app.railway.app

# Test health check
curl $RAILWAY_URL/api/test

# Test dashboard
curl $RAILWAY_URL/api/dashboard/stats

# Open in browser
open $RAILWAY_URL
```

---

## Database Management

### Migrations

#### Create Migration

```bash
# After schema changes in prisma/schema.prisma
npx prisma migrate dev --name add_new_field

# This creates a migration file in prisma/migrations/
```

#### Apply Migrations

```bash
# Development
npx prisma migrate dev

# Production (use db push for now)
npx prisma db push
```

### Backup & Restore

#### Neon Database

Neon provides automatic backups:
- **Retention**: 7 days (free tier), 30 days (paid)
- **Point-in-time recovery**: Available on paid tiers
- **Manual backup**: Export via Neon console

#### Manual Backup

```bash
# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore from backup
psql $DATABASE_URL < backup_20250203.sql
```

### Database Inspection

```bash
# Open Prisma Studio (database GUI)
npx prisma studio

# This opens http://localhost:5555
# View and edit data directly
```

### Performance Optimization

#### Add Indexes

```sql
-- High-traffic queries
CREATE INDEX idx_budget_lookup ON "Budget"("customerId", "department", "fiscalPeriod");
CREATE INDEX idx_utilization_budget ON "BudgetUtilization"("budgetId");
CREATE INDEX idx_audit_budget ON "AuditLog"("budgetId", "createdAt");
```

#### Connection Pooling

In `lib/prisma.ts`:
```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=10'
    }
  }
});
```

---

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `NODE_ENV` | Environment mode | `production` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `LOG_LEVEL` | Logging verbosity | `info` |

### Environment Files

```
.env                 # Committed (defaults)
.env.local           # Local development (gitignored)
.env.production      # Production overrides (gitignored)
```

### Managing Secrets

```bash
# Never commit secrets to Git
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore

# Use Railway for production secrets
railway variables set DATABASE_URL="postgresql://..."

# Rotate secrets regularly
railway variables set DATABASE_URL="new-connection-string"
```

---

## Monitoring & Maintenance

### Health Checks

```bash
# Health check endpoint
curl https://your-app.railway.app/api/test

# Expected response:
{
  "status": "ok",
  "timestamp": "2026-02-03T07:00:00.000Z"
}
```

### Application Logs

#### Railway Logs

```bash
# Via Railway CLI
railway logs

# View specific deployment
railway logs --deployment <deployment-id>

# Follow logs in real-time
railway logs --tail
```

#### Log Levels

- **INFO**: Normal operations
- **WARN**: Potential issues
- **ERROR**: Operation failures

### Database Monitoring

```bash
# Check database size
SELECT pg_size_pretty(pg_database_size('neondb'));

# Check table sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Active connections
SELECT count(*) FROM pg_stat_activity;
```

### Performance Monitoring

#### Key Metrics

1. **Response Time**
   - Target: <200ms for API calls
   - Monitor: `/api/test` endpoint

2. **Database Queries**
   - Target: <100ms per query
   - Monitor: Neon dashboard

3. **Error Rate**
   - Target: <1% of requests
   - Monitor: Railway logs

#### Alerts (Setup)

```typescript
// Planned: Add monitoring service
// - Sentry for error tracking
// - Datadog for metrics
// - PagerDuty for alerts
```

### Regular Maintenance

#### Weekly Tasks

- [ ] Review error logs
- [ ] Check database size
- [ ] Verify backups
- [ ] Review critical budgets

#### Monthly Tasks

- [ ] Update dependencies
- [ ] Review audit logs
- [ ] Database optimization
- [ ] Performance review

#### Quarterly Tasks

- [ ] Security audit
- [ ] Dependency updates (major versions)
- [ ] Database cleanup
- [ ] Load testing

---

## Troubleshooting

### Common Issues

#### Issue 1: Database Connection Failed

**Symptoms**:
```
Error: P1001: Can't reach database server
```

**Solutions**:
```bash
# Check DATABASE_URL
echo $DATABASE_URL

# Verify database is running
psql $DATABASE_URL -c "SELECT 1;"

# Check SSL requirement
# Neon requires: ?sslmode=require&channel_binding=require

# Test connectivity
nc -zv hostname 5432
```

#### Issue 2: Build Failed

**Symptoms**:
```
Error: Module not found
```

**Solutions**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Verify Node version
node --version  # Must be 18+

# Check package.json
npm run build
```

#### Issue 3: Prisma Client Not Generated

**Symptoms**:
```
Error: @prisma/client did not initialize yet
```

**Solutions**:
```bash
# Generate Prisma client
npx prisma generate

# Verify schema is valid
npx prisma validate

# Push schema to database
npx prisma db push
```

#### Issue 4: Excel Upload Fails

**Symptoms**:
```
Error: File parsing failed
```

**Solutions**:
- Check file format (must be .xlsx)
- Verify column headers match template
- Check for special characters
- Ensure numeric fields are numbers

#### Issue 5: Budget Check Returns No Budget Found

**Symptoms**:
```json
{
  "available": false,
  "reason": "No budget found"
}
```

**Solutions**:
```bash
# Verify budget exists
npx prisma studio

# Check parameters match:
# - customerId
# - department
# - subCategory (can be null)
# - fiscalPeriod (exact match)

# Reseed database if needed
npx prisma db seed
```

### Debug Mode

```bash
# Enable Prisma query logging
DATABASE_URL="postgresql://...?log=query"

# Enable Next.js debug mode
DEBUG=* npm run dev

# Check Railway deployment logs
railway logs --tail
```

---

## Rollback Procedures

### Application Rollback

#### Method 1: Railway Deployment History

1. Go to Railway project → Deployments
2. Find previous successful deployment
3. Click "⋯" menu → "Redeploy"
4. Confirm rollback

#### Method 2: Git Revert

```bash
# Find commit to rollback to
git log --oneline

# Revert to previous commit
git revert HEAD

# Or reset to specific commit
git reset --hard <commit-hash>

# Push to trigger deployment
git push origin main
```

### Database Rollback

#### Option 1: Restore from Backup (Neon)

1. Go to Neon Console → Backups
2. Select backup point
3. Click "Restore"
4. Update `DATABASE_URL` if needed

#### Option 2: Manual SQL Restore

```bash
# Restore from backup file
psql $DATABASE_URL < backup_20250203.sql
```

#### Option 3: Migration Rollback

```bash
# Rollback last migration (if using migrate)
npx prisma migrate resolve --rolled-back <migration-name>
```

### Emergency Procedures

#### Complete System Failure

1. **Verify health check**: `curl /api/test`
2. **Check Railway status**: https://status.railway.app
3. **Review logs**: `railway logs --tail`
4. **Rollback deployment**: Use Railway UI
5. **Notify stakeholders**: Inform team of issue

#### Data Corruption

1. **Stop write operations**: Scale down to 0 replicas
2. **Assess damage**: Query affected tables
3. **Restore from backup**: Use latest good backup
4. **Verify integrity**: Run data validation queries
5. **Resume operations**: Scale back up

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] Database migrations ready
- [ ] Environment variables configured
- [ ] Backup recent database

### During Deployment

- [ ] Monitor build logs
- [ ] Verify database migration
- [ ] Check health endpoint
- [ ] Test critical APIs
- [ ] Verify frontend loads

### Post-Deployment

- [ ] Smoke test all features
- [ ] Check error logs
- [ ] Verify audit logs
- [ ] Monitor performance
- [ ] Update documentation

---

## CI/CD Pipeline (Planned)

### GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run lint
      - run: npm run test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: railway up
```

---

## Security Considerations

### Pre-Deployment Security

- [ ] No secrets in code
- [ ] Environment variables secured
- [ ] Database credentials rotated
- [ ] SSL enabled
- [ ] API endpoints validated

### Post-Deployment Security

- [ ] Health check working
- [ ] Logs not exposing secrets
- [ ] Database connections encrypted
- [ ] No public write endpoints

---

## Support & Resources

### Documentation
- [Railway Docs](https://docs.railway.app)
- [Neon Docs](https://neon.tech/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [Next.js Docs](https://nextjs.org/docs)

### Support Channels
- **Railway**: https://railway.app/discord
- **Neon**: support@neon.tech
- **GitHub Issues**: https://github.com/rajiv-ramanan-84/spendflo/issues

### Emergency Contacts
- **DevOps**: (to be added)
- **Database Admin**: (to be added)
- **On-call Engineer**: (to be added)
