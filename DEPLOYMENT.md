# 🚀 Deployment Guide

Complete guide to deploying SpendFlo Budget to production.

---

## Quick Deploy (5 Minutes)

### Option 1: Vercel (Recommended for Next.js)

#### Step 1: Prepare Database

```bash
# Use your production database URL
# Recommended: Neon, Supabase, or Railway PostgreSQL
```

#### Step 2: Deploy to Vercel

**Via Web Interface** (Easiest):

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import from Git (GitHub/GitLab)
4. Select this repository
5. Add Environment Variables (see below)
6. Click "Deploy"

**Via CLI**:

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Follow prompts, then deploy to production
vercel --prod
```

#### Step 3: Add Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```env
# Database (Required)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# JWT (Required)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRY=7d

# Password Hashing (Required)
BCRYPT_ROUNDS=12

# Google OAuth (Optional - for Sheets integration)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/api/google-sheets/auth/callback

# Feature Flags (Optional)
ENABLE_AUTO_APPROVAL=true
ENABLE_AI_MAPPING=true
ENABLE_GOOGLE_SHEETS=true
```

#### Step 4: Run Database Migrations

```bash
# Using Vercel CLI
vercel env pull .env.production
npx prisma db push --accept-data-loss
```

**Or use Prisma Data Platform**:
1. Go to [prisma.io/data-platform](https://www.prisma.io/data-platform)
2. Connect your database
3. Run migrations

#### Step 5: Test Deployment

```bash
# Your app will be at:
https://your-project.vercel.app

# Test API
curl https://your-project.vercel.app/api/health
```

---

## Option 2: Railway

### Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Deploy

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize
railway init

# Add database
railway add postgresql

# Deploy
railway up

# Set environment variables
railway variables set JWT_SECRET=your-secret-key
railway variables set DATABASE_URL=${{DATABASE_URL}}
```

### Step 3: Custom Domain

```bash
railway domain
```

---

## Option 3: Docker + Any Host

### Step 1: Build Docker Image

```bash
# Build
docker build -t spendflo-budget .

# Run locally
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="your-secret" \
  spendflo-budget
```

### Step 2: Deploy to Container Host

**DigitalOcean App Platform**:
1. Create new app
2. Connect Git repository
3. Select Dockerfile
4. Add environment variables
5. Deploy

**AWS ECS**:
```bash
# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login ...
docker tag spendflo-budget:latest your-ecr-repo/spendflo-budget:latest
docker push your-ecr-repo/spendflo-budget:latest

# Deploy to ECS
aws ecs update-service --cluster your-cluster --service spendflo-budget --force-new-deployment
```

---

## Database Setup

### Recommended Providers

#### 1. **Neon** (Serverless PostgreSQL)
- Go to [neon.tech](https://neon.tech)
- Create project
- Copy connection string
- Add to `DATABASE_URL`

#### 2. **Supabase**
- Go to [supabase.com](https://supabase.com)
- Create project
- Get connection string
- Use "Connection Pooling" URL

#### 3. **Railway**
```bash
railway add postgresql
railway variables
# Copy DATABASE_URL
```

### Database Migration

```bash
# Production migration
DATABASE_URL="your-prod-url" npx prisma db push

# Or use Prisma Migrate
npx prisma migrate deploy
```

---

## Environment Variables Reference

### Required Variables

```env
# Database Connection
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT Configuration (Generate strong secret!)
JWT_SECRET=generate-with-openssl-rand-base64-32
JWT_EXPIRY=7d

# Password Security
BCRYPT_ROUNDS=12
```

### Optional Variables

```env
# Google OAuth (for Sheets integration)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REDIRECT_URI=https://your-domain.com/api/google-sheets/auth/callback

# Feature Flags
ENABLE_AUTO_APPROVAL=true
ENABLE_AI_MAPPING=true
ENABLE_GOOGLE_SHEETS=true

# Optional: Sentry for error tracking
SENTRY_DSN=https://xxx@sentry.io/xxx

# Optional: Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

### Generate Secrets

```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Post-Deployment Checklist

### 1. Security

- [ ] Strong `JWT_SECRET` set (32+ characters)
- [ ] Database uses SSL/TLS
- [ ] HTTPS enforced (automatic on Vercel/Railway)
- [ ] API keys properly configured
- [ ] CORS configured correctly
- [ ] Rate limiting enabled

### 2. Database

- [ ] Migrations run successfully
- [ ] Connection pooling enabled
- [ ] Backups configured
- [ ] Indexes created

### 3. Testing

- [ ] Health check endpoint works: `/api/health`
- [ ] Authentication works
- [ ] API keys can be created
- [ ] Budget checks work
- [ ] Auto-approval works
- [ ] File uploads work

### 4. Monitoring

- [ ] Error tracking (Sentry)
- [ ] Performance monitoring
- [ ] Database monitoring
- [ ] Uptime monitoring

### 5. DNS & Domain

- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] DNS propagated

---

## Testing Production

### 1. Health Check

```bash
curl https://your-domain.com/api/health
```

### 2. Create Test User

```bash
curl -X POST https://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User"
  }'
```

### 3. Login

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'
```

### 4. Create API Key

```bash
curl -X POST https://your-domain.com/api/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production API Key",
    "permissions": ["budget.read"],
    "customerId": "cust_id",
    "createdById": "user_id"
  }'
```

---

## Rollback Strategy

### Vercel

```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback <deployment-url>
```

### Railway

```bash
# List deployments
railway status

# Rollback
railway rollback
```

### Docker

```bash
# Use previous image tag
docker pull your-repo/spendflo-budget:previous-tag
docker run ...
```

---

## Troubleshooting

### "Database connection failed"

**Solution**:
- Check `DATABASE_URL` format
- Ensure database is accessible
- Check firewall rules
- Verify SSL mode if required

```env
# For Neon/Supabase, add SSL mode
DATABASE_URL=postgresql://...?sslmode=require
```

### "JWT verification failed"

**Solution**:
- Ensure `JWT_SECRET` matches across deployments
- Check token hasn't expired
- Verify clock sync on servers

### "File upload fails"

**Solution**:
- Check body parser limits
- Verify file size limits
- Ensure `/tmp` directory writable (automatic on Vercel)

### "Google OAuth redirect mismatch"

**Solution**:
1. Update `GOOGLE_REDIRECT_URI` to production URL
2. Add URL to Google Cloud Console → Authorized redirect URIs

---

## Performance Optimization

### 1. Database Connection Pooling

```env
# Use connection pooling URL
DATABASE_URL=postgresql://user:password@host:5432/db?pgbouncer=true&connection_limit=10
```

### 2. Enable Caching

Add to `next.config.js`:

```javascript
module.exports = {
  images: {
    domains: ['your-domain.com'],
  },
  // Enable SWC minification
  swcMinify: true,
  // Enable compression
  compress: true,
};
```

### 3. CDN for Static Assets

Vercel automatically serves static assets via CDN.

For custom CDN:
```javascript
// next.config.js
module.exports = {
  assetPrefix: 'https://cdn.your-domain.com',
};
```

---

## Monitoring Setup

### 1. Sentry (Error Tracking)

```bash
npm install @sentry/nextjs
```

```javascript
// sentry.config.js
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### 2. Vercel Analytics

Enable in Vercel Dashboard → Analytics

### 3. Database Monitoring

**Neon**: Built-in dashboard
**Supabase**: Database > Performance
**Railway**: Metrics tab

---

## Scaling

### Horizontal Scaling

Vercel automatically scales based on traffic.

For self-hosted:
```bash
# Docker Compose with multiple instances
docker-compose up --scale app=3
```

### Database Scaling

**Read Replicas**:
```env
DATABASE_URL=postgresql://primary
DATABASE_READ_URL=postgresql://replica
```

**Connection Pooling**:
- Use PgBouncer
- Set connection limits
- Monitor connection usage

---

## Backup Strategy

### Database Backups

**Automated** (Recommended):
- Neon: Automatic daily backups
- Supabase: Point-in-time recovery
- Railway: Daily backups

**Manual**:
```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Code Backups

- Git repository (primary backup)
- Vercel/Railway keep deployment history
- Tag releases: `git tag v1.0.0`

---

## CI/CD Setup

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

---

## Cost Estimation

### Vercel (Recommended)

- **Hobby**: Free (personal projects)
- **Pro**: $20/month (production)
  - Unlimited deployments
  - 100GB bandwidth
  - Advanced analytics

### Database (Neon)

- **Free**: 0.5GB storage, 10 hours compute
- **Launch**: $19/month (production)
  - 10GB storage
  - Unlimited compute
  - Daily backups

### Total Monthly Cost

- **Small team**: ~$40/month (Vercel Pro + Neon Launch)
- **Growing team**: ~$100/month (add monitoring, CDN)
- **Enterprise**: Custom pricing

---

## Support & Maintenance

### Regular Tasks

**Daily**:
- Monitor error rates
- Check API response times

**Weekly**:
- Review database performance
- Check disk usage
- Update dependencies

**Monthly**:
- Security updates
- Backup verification
- Cost optimization

### Updates

```bash
# Update dependencies
npm update

# Check for security issues
npm audit

# Update Prisma
npm install @prisma/client@latest prisma@latest
```

---

## 🎉 Deployment Complete!

Your SpendFlo Budget application is now live in production!

### Next Steps

1. Share the URL with your team
2. Set up monitoring
3. Configure backups
4. Add your custom domain
5. Enable analytics

**Questions?** Check the documentation in `/docs` or create an issue.

---

## Quick Reference

### Vercel Commands

```bash
vercel                    # Deploy to preview
vercel --prod            # Deploy to production
vercel logs              # View logs
vercel env ls            # List environment variables
vercel domains           # Manage domains
```

### Database Commands

```bash
npx prisma studio        # Database GUI
npx prisma db push       # Push schema changes
npx prisma migrate dev   # Create migration
npx prisma generate      # Generate client
```

### Health Checks

```bash
# App health
curl https://your-domain.com/api/health

# Database connection
npx prisma db execute --stdin < test.sql
```

---

**🚀 Your application is live!** Share it with your team and start managing budgets efficiently.
