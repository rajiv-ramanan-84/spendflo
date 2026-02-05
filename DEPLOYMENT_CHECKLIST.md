# Deployment Checklist - Budget Sync System

## Pre-Deployment

### Database
- [ ] Run Prisma migrations: `npx prisma migrate deploy`
- [ ] Verify schema: Budget, BudgetUtilization, ImportHistory, BudgetDataSourceConfig tables exist
- [ ] Set up database backups
- [ ] Configure connection pooling (recommend: 10-20 connections)

### Environment Variables
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `NEXTAUTH_SECRET` - Authentication secret
- [ ] `NEXTAUTH_URL` - Application URL
- [ ] `AWS_ACCESS_KEY_ID` - (if using S3)
- [ ] `AWS_SECRET_ACCESS_KEY` - (if using S3)
- [ ] `GOOGLE_CLIENT_ID` - (if using Google Sheets)
- [ ] `GOOGLE_CLIENT_SECRET` - (if using Google Sheets)

### Dependencies
- [ ] `npm install` - Install all dependencies
- [ ] Verify `ssh2-sftp-client@12.0.1` installed
- [ ] Verify `xlsx@0.18.5` installed
- [ ] Verify `prisma` and `@prisma/client` versions match

### File Storage
- [ ] Create directory: `/tmp/spendflo-budget-imports` (or custom path)
- [ ] Set write permissions: `chmod 755 /tmp/spendflo-budget-imports`
- [ ] Configure cleanup cron job (7-day retention recommended)

## Deployment

### Build
- [ ] `npm run build` - Build Next.js app
- [ ] Verify build succeeds with no errors
- [ ] Test production build locally: `npm start`

### Deploy to Environment
- [ ] Deploy application code
- [ ] Restart application server
- [ ] Verify health endpoint responds
- [ ] Check application logs for errors

### Smoke Tests
- [ ] Open: `https://your-domain.com`
- [ ] Navigate to: `/fpa/import`
- [ ] Upload test file: `test-data/1_standard_format.csv`
- [ ] Verify import completes successfully
- [ ] Check database: `SELECT COUNT(*) FROM "Budget"`

## Post-Deployment Validation

### Feature Tests
- [ ] **File Upload**: Upload Excel/CSV file works
- [ ] **AI Mapping**: Column detection works
- [ ] **Import**: Data saves to database
- [ ] **Budget Check API**: `/api/budget/check` returns correct response
- [ ] **Import History**: `/api/imports/history` shows imports
- [ ] **Dashboard**: Budget list displays correctly

### File Type Detection
- [ ] Upload budget file - should proceed normally
- [ ] Upload `test-data/payroll_sample.csv` - should show warning
- [ ] Verify warning dialog appears
- [ ] Test "Cancel" button works
- [ ] Test "Continue Anyway" works

### Performance
- [ ] Import 100 rows - should complete < 5 seconds
- [ ] Import 1000 rows - should complete < 30 seconds
- [ ] Budget check API - should respond < 100ms
- [ ] Dashboard load - should display < 2 seconds

### Security
- [ ] Authentication required for all endpoints
- [ ] File upload size limit enforced (recommend: 10MB)
- [ ] SQL injection protection verified
- [ ] XSS protection verified
- [ ] CSRF tokens working

## Customer Onboarding Setup

### For Each New Customer

#### 1. Database Setup
- [ ] Customer record created in database
- [ ] User accounts created
- [ ] Roles assigned (admin, viewer, etc.)

#### 2. SFTP Configuration (if needed)
```sql
INSERT INTO "BudgetDataSourceConfig" (
  "customerId",
  "sourceType",
  "config",
  "schedule",
  "isActive"
) VALUES (
  '<customer_id>',
  'sftp',
  '{"host": "customer-sftp.com", "port": 22, "username": "spendflo", "password": "***", "remotePath": "/budgets/", "filePattern": "*.csv"}',
  '0 2 * * *',  -- Daily at 2am
  true
);
```

#### 3. Google Sheets Configuration (if needed)
- [ ] Customer authorizes Google Sheets access
- [ ] OAuth tokens stored securely
- [ ] Test connection works

#### 4. Test Import
- [ ] Import sample customer data
- [ ] Verify data quality
- [ ] Validate budget calculations
- [ ] Check dashboard displays correctly

## Monitoring Setup

### Logs to Monitor
- [ ] Import success/failure rates
- [ ] File type detection warnings
- [ ] Budget check API response times
- [ ] SFTP connection failures
- [ ] Database query performance

### Alerts to Configure
- [ ] Import failure rate > 10%
- [ ] API response time > 1 second
- [ ] File type warnings > 50% of uploads
- [ ] SFTP connection failures
- [ ] Database connection pool exhausted

### Metrics to Track
- [ ] Imports per day
- [ ] Average import time
- [ ] File types uploaded (budget vs non-budget)
- [ ] Budget check API calls per day
- [ ] Active customers using feature

## Rollback Plan

### If Deployment Fails

1. **Immediate Actions**
   - [ ] Revert to previous version
   - [ ] Verify application starts
   - [ ] Check database integrity
   - [ ] Notify stakeholders

2. **Database Rollback**
   - [ ] Restore database backup (if migrations ran)
   - [ ] Or: `npx prisma migrate resolve --rolled-back <migration_name>`

3. **Communication**
   - [ ] Update status page
   - [ ] Notify customers (if they were using feature)
   - [ ] Internal team notification

## Success Criteria

### Must Pass Before Going Live
- [x] All automated tests pass (4/4 file detection, 3/3 budget check)
- [ ] Manual smoke tests pass
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Documentation complete

### Nice to Have
- [ ] SFTP tested with real customer server
- [ ] S3 integration tested
- [ ] Google Sheets tested with 1000+ rows
- [ ] Load testing with concurrent users

## Documentation Verification

- [ ] CTO briefing document ready
- [ ] Engineering integration guide ready
- [ ] Customer-facing team guide ready
- [ ] API documentation updated
- [ ] Support runbook created

## Final Sign-Off

- [ ] Engineering Lead approval
- [ ] Security review complete
- [ ] CTO approval
- [ ] Product Manager approval
- [ ] Ready for production deployment

---

## Emergency Contacts

**Engineering:**
- On-call engineer: [Contact info]
- Backup: [Contact info]

**Database:**
- DBA contact: [Contact info]

**Infrastructure:**
- DevOps lead: [Contact info]

---

## Deployment Date

**Target Date:** _______________
**Deployed By:** _______________
**Deployment Time:** _______________
**Rollback Deadline:** _______________ (recommend: 2 hours post-deployment)

---

## Post-Deployment Review

**24 Hours After Deployment:**
- [ ] Review error logs
- [ ] Check monitoring dashboards
- [ ] Verify no customer complaints
- [ ] Review performance metrics

**1 Week After Deployment:**
- [ ] Success metrics review
- [ ] Customer feedback collected
- [ ] Performance optimization identified
- [ ] Lessons learned documented
