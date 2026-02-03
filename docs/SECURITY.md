# SpendFlo Budget Service - Security Documentation

## Table of Contents
1. [Security Overview](#security-overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Data Security](#data-security)
4. [API Security](#api-security)
5. [Database Security](#database-security)
6. [Infrastructure Security](#infrastructure-security)
7. [Compliance](#compliance)
8. [Incident Response](#incident-response)
9. [Security Roadmap](#security-roadmap)

---

## Security Overview

### Current Security Posture

**Status**: Development/MVP Stage
**Risk Level**: Medium (suitable for internal use, needs hardening for production)

### Security Layers

```
┌─────────────────────────────────────┐
│   Layer 1: Infrastructure (Railway) │  ✅ HTTPS, SSL
├─────────────────────────────────────┤
│   Layer 2: Application (Next.js)    │  ⚠️  No auth yet
├─────────────────────────────────────┤
│   Layer 3: API (RESTful)             │  ⚠️  Open endpoints
├─────────────────────────────────────┤
│   Layer 4: Database (PostgreSQL)     │  ✅ SSL, pooling
└─────────────────────────────────────┘
```

✅ = Implemented
⚠️ = Planned/Needs improvement

---

## Authentication & Authorization

### Current State: No Authentication

**APIs are currently open** for development purposes. All endpoints accept requests without authentication.

**Risk**: Anyone with the URL can access and modify data.

### Planned Authentication Strategy

#### Phase 1: API Key Authentication (Quick Win)

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey || !isValidApiKey(apiKey)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}
```

**Implementation**:
- Generate API keys per customer
- Store hashed keys in database
- Add `X-API-Key` header requirement

#### Phase 2: JWT Authentication (Full Implementation)

```typescript
// Authentication flow
1. User logs in → Receives JWT token
2. Token includes: userId, customerId, role
3. Token expires after 24 hours
4. Refresh token for extended sessions

// Example JWT payload
{
  "sub": "user-id",
  "customerId": "customer-id",
  "role": "fpa_user",
  "exp": 1738550400
}
```

**Libraries**:
- `jsonwebtoken` for token generation
- `bcrypt` for password hashing
- `jose` for JWT validation

### Authorization Levels

#### Roles & Permissions

| Role | Permissions |
|------|-------------|
| **FP&A Admin** | Full access: create/update/delete budgets, upload Excel, view audit logs |
| **FP&A User** | Read budgets, upload Excel, view audit logs |
| **Business User** | Submit requests, check budget availability |
| **System Integration** | API-only: check, reserve, commit, release budgets |

#### Permission Matrix

| Action | FP&A Admin | FP&A User | Business User | System |
|--------|------------|-----------|---------------|--------|
| View budgets | ✅ | ✅ | ❌ | ✅ |
| Create budget | ✅ | ❌ | ❌ | ❌ |
| Update budget | ✅ | ❌ | ❌ | ❌ |
| Delete budget | ✅ | ❌ | ❌ | ❌ |
| Upload Excel | ✅ | ✅ | ❌ | ❌ |
| Check budget | ✅ | ✅ | ✅ | ✅ |
| Reserve budget | ✅ | ❌ | ❌ | ✅ |
| Commit budget | ✅ | ❌ | ❌ | ✅ |
| Release budget | ✅ | ❌ | ❌ | ✅ |
| View audit logs | ✅ | ✅ | ❌ | ❌ |

### Multi-Tenant Isolation

```typescript
// Enforce customer isolation in all queries
const budgets = await prisma.budget.findMany({
  where: {
    customerId: session.customerId, // Always filter by customer
    department,
    fiscalPeriod
  }
});

// Prevent cross-customer access
if (budget.customerId !== session.customerId) {
  throw new Error('Unauthorized access');
}
```

---

## Data Security

### Data Classification

| Data Type | Sensitivity | Encryption |
|-----------|-------------|------------|
| Budget amounts | High | At rest + in transit |
| Customer names | Medium | In transit |
| User passwords | Critical | Hashed (bcrypt) |
| API keys | Critical | Hashed |
| Audit logs | High | At rest + in transit |

### Encryption

#### In Transit
- ✅ **HTTPS only**: All traffic encrypted via TLS 1.3
- ✅ **SSL database**: PostgreSQL connections require SSL
- ✅ **No mixed content**: All resources served over HTTPS

#### At Rest
- ✅ **Database encryption**: Neon provides automatic encryption at rest
- ⚠️ **Application-level encryption**: Not yet implemented for sensitive fields

**Planned**: Encrypt sensitive fields using AES-256

```typescript
import { encrypt, decrypt } from '@/lib/crypto';

// Before saving
const encryptedAmount = encrypt(budgetAmount);

// After retrieving
const budgetAmount = decrypt(encryptedAmount);
```

### Sensitive Data Handling

#### Password Storage

```typescript
// ✅ Correct: Hashed with bcrypt
import bcrypt from 'bcrypt';

const hashedPassword = await bcrypt.hash(password, 10);
await prisma.user.create({
  data: { password: hashedPassword }
});

// Verification
const isValid = await bcrypt.compare(inputPassword, hashedPassword);
```

#### API Key Storage

```typescript
// ✅ Correct: Hashed before storage
import crypto from 'crypto';

const apiKey = crypto.randomBytes(32).toString('hex');
const hashedKey = crypto
  .createHash('sha256')
  .update(apiKey)
  .digest('hex');

await prisma.apiKey.create({
  data: { keyHash: hashedKey }
});

// Return unhashed key only once to user
return { apiKey }; // User must save this
```

### Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|------------------|-----------------|
| Budgets | Until deleted by user | Soft delete |
| Audit logs | 7 years (compliance) | Never deleted |
| User sessions | 24 hours | Auto-expire |
| File uploads | Immediate | Not stored (processed in memory) |

---

## API Security

### Input Validation

```typescript
// ✅ Validate all inputs
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Required fields
  if (!body.department || !body.fiscalPeriod || !body.amount) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  // Type validation
  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return NextResponse.json(
      { error: 'Amount must be a positive number' },
      { status: 400 }
    );
  }

  // Sanitize strings
  const department = sanitize(body.department);
  const fiscalPeriod = sanitize(body.fiscalPeriod);

  // Continue processing...
}
```

### SQL Injection Prevention

✅ **Using Prisma ORM**: All queries are parameterized automatically

```typescript
// ✅ Safe: Prisma parameterizes queries
const budget = await prisma.budget.findFirst({
  where: {
    department: userInput, // Safe
    fiscalPeriod: userInput // Safe
  }
});

// ❌ Never do this:
// await prisma.$queryRaw`SELECT * FROM Budget WHERE department = '${userInput}'`
```

### XSS Prevention

✅ **React escapes by default**: All user input is escaped

```typescript
// ✅ Safe: React escapes automatically
<div>{userInput}</div>

// ❌ Dangerous: Using dangerouslySetInnerHTML
// <div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### CSRF Protection

```typescript
// Planned: Add CSRF tokens
import { generateToken, verifyToken } from '@/lib/csrf';

// Generate token on page load
const csrfToken = generateToken();

// Verify token on form submission
if (!verifyToken(body.csrfToken)) {
  return NextResponse.json(
    { error: 'Invalid CSRF token' },
    { status: 403 }
  );
}
```

### Rate Limiting

**Planned**: Per-customer rate limits

```typescript
import { RateLimiter } from '@/lib/rate-limiter';

const limiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute per customer
});

export async function middleware(request: NextRequest) {
  const customerId = getCustomerId(request);

  if (!limiter.check(customerId)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  return NextResponse.next();
}
```

### API Security Headers

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"
          }
        ]
      }
    ];
  }
};
```

---

## Database Security

### Connection Security

✅ **SSL Required**:
```
DATABASE_URL="postgresql://...?sslmode=require&channel_binding=require"
```

✅ **Connection Pooling**:
- Limits concurrent connections
- Prevents connection exhaustion
- Timeout configuration

```typescript
// lib/prisma.ts
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=10&pool_timeout=20'
    }
  }
});
```

### Access Control

#### Database User Permissions

```sql
-- Application user (least privilege)
CREATE USER app_user WITH PASSWORD 'strong_password';

-- Grant only necessary permissions
GRANT SELECT, INSERT, UPDATE ON Budget TO app_user;
GRANT SELECT, INSERT, UPDATE ON BudgetUtilization TO app_user;
GRANT SELECT, INSERT ON AuditLog TO app_user; -- No UPDATE/DELETE

-- No DELETE permission on critical tables
```

### Data Integrity

```prisma
// Enforce constraints at database level
model Budget {
  id             String  @id @default(cuid())
  budgetedAmount Float   @db.Decimal(12, 2) // Precision

  @@unique([customerId, department, subCategory, fiscalPeriod])
  @@index([customerId, department])
}
```

### Audit Logging

```typescript
// Log all sensitive operations
async function createAuditLog(
  budgetId: string,
  action: string,
  userId: string,
  oldValue?: string,
  newValue?: string
) {
  await prisma.auditLog.create({
    data: {
      budgetId,
      action,
      oldValue,
      newValue,
      changedBy: userId,
      createdAt: new Date()
    }
  });
}

// Example usage
await createAuditLog(
  budget.id,
  'UPDATE',
  session.userId,
  JSON.stringify(oldBudget),
  JSON.stringify(newBudget)
);
```

### Backup & Recovery

✅ **Neon Automatic Backups**:
- Daily backups
- 7-day retention (free tier)
- Point-in-time recovery (paid tier)

**Planned**: Additional backup strategy
```bash
# Weekly backup to S3
pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://backups/budget_$(date +%Y%m%d).sql.gz
```

---

## Infrastructure Security

### Railway Security

✅ **Provided by Railway**:
- HTTPS enforcement
- SSL certificates (auto-renewed)
- DDoS protection
- Network isolation
- Firewall rules

### Environment Variables

✅ **Never commit secrets**:
```bash
# .gitignore
.env.local
.env.production
.env*.local
```

✅ **Use Railway Variables**:
- Encrypted at rest
- Encrypted in transit
- Access control
- Audit logs

### Container Security

```dockerfile
# Planned: Custom Dockerfile
FROM node:18-alpine AS base

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Copy app
COPY --chown=nextjs:nodejs . .

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 8080

# Start app
CMD ["npm", "start"]
```

### Network Security

```
Internet
   ↓ HTTPS (TLS 1.3)
Railway Load Balancer
   ↓ Internal network
Next.js Container
   ↓ SSL (required)
PostgreSQL (Neon)
```

---

## Compliance

### GDPR Compliance

#### Data Subject Rights

**Right to Access**:
```typescript
// Export user data
export async function exportUserData(userId: string) {
  const data = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      Request: true,
      // Include all related data
    }
  });

  return JSON.stringify(data, null, 2);
}
```

**Right to Deletion**:
```typescript
// Delete user and anonymize audit logs
export async function deleteUser(userId: string) {
  await prisma.$transaction([
    prisma.request.deleteMany({ where: { createdById: userId } }),
    prisma.auditLog.updateMany({
      where: { changedBy: userId },
      data: { changedBy: 'DELETED_USER' }
    }),
    prisma.user.delete({ where: { id: userId } })
  ]);
}
```

#### Data Processing Agreement

**Required for production**:
- Purpose limitation
- Data minimization
- Storage limitation
- Integrity and confidentiality
- Accountability

### SOC 2 Compliance (Planned)

**Trust Service Criteria**:
1. **Security**: Access controls, encryption, monitoring
2. **Availability**: Uptime, disaster recovery
3. **Processing Integrity**: Data validation, error handling
4. **Confidentiality**: Encryption, access controls
5. **Privacy**: GDPR compliance, data handling

### Financial Data Compliance

#### PCI DSS (If handling payment cards)
- Not currently applicable
- If integrated with payment processing, full PCI DSS compliance required

#### SOX Compliance (If public company)
- Audit trail (✅ implemented)
- Access controls (⚠️ planned)
- Change management (⚠️ planned)

---

## Incident Response

### Security Incident Categories

| Severity | Examples | Response Time |
|----------|----------|---------------|
| **P0 - Critical** | Data breach, unauthorized access | Immediate |
| **P1 - High** | SQL injection attempt, XSS exploit | <1 hour |
| **P2 - Medium** | Rate limit bypass, suspicious activity | <24 hours |
| **P3 - Low** | Failed login attempts, minor bugs | <1 week |

### Incident Response Plan

#### 1. Detection

**Monitoring**:
- Failed authentication attempts
- Unusual API usage patterns
- Database query anomalies
- Error rate spikes

#### 2. Containment

```typescript
// Emergency: Disable compromised API key
await prisma.apiKey.update({
  where: { id: compromisedKeyId },
  data: { isActive: false }
});

// Emergency: Lock user account
await prisma.user.update({
  where: { id: suspiciousUserId },
  data: { isLocked: true }
});
```

#### 3. Investigation

```sql
-- Review audit logs
SELECT * FROM "AuditLog"
WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC;

-- Check suspicious IPs
SELECT ip_address, COUNT(*) as requests
FROM request_logs
WHERE timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) > 100;
```

#### 4. Recovery

- Restore from backup if needed
- Rotate compromised credentials
- Apply security patches
- Update firewall rules

#### 5. Post-Incident

- Document incident
- Update security measures
- Notify affected parties (if required)
- Conduct review meeting

### Contact Information

**Security Team**:
- Email: security@spendflo.com (to be set up)
- Phone: (to be added)
- On-call: (to be added)

**Escalation Path**:
1. Engineering team
2. CTO
3. CEO
4. Legal counsel (for breaches)

---

## Security Roadmap

### Phase 1: MVP Security (Current)
- [x] HTTPS enforcement
- [x] SSL database connections
- [x] Input validation
- [x] SQL injection prevention (Prisma)
- [x] XSS prevention (React)

### Phase 2: Production Ready (Q1 2026)
- [ ] JWT authentication
- [ ] Role-based access control
- [ ] API key management
- [ ] Rate limiting
- [ ] CSRF protection
- [ ] Security headers
- [ ] Audit logging enhancement

### Phase 3: Enterprise (Q2 2026)
- [ ] SSO integration (SAML/OAuth)
- [ ] IP whitelisting
- [ ] Advanced monitoring (Sentry)
- [ ] Penetration testing
- [ ] Security certifications (SOC 2)
- [ ] Data encryption at rest
- [ ] DLP (Data Loss Prevention)

### Phase 4: Advanced (Q3 2026)
- [ ] Zero Trust Architecture
- [ ] End-to-end encryption
- [ ] Hardware security modules
- [ ] Advanced threat detection
- [ ] Automated security scanning
- [ ] Bug bounty program

---

## Security Best Practices

### For Developers

1. **Never commit secrets**
   ```bash
   git-secrets --install
   git-secrets --register-aws
   ```

2. **Use environment variables**
   ```typescript
   const apiKey = process.env.API_KEY; // ✅
   const apiKey = 'hardcoded-key'; // ❌
   ```

3. **Validate all inputs**
   ```typescript
   if (!isValid(input)) throw new Error(); // ✅
   const result = await query(input); // ❌ No validation
   ```

4. **Use prepared statements**
   ```typescript
   await prisma.budget.findFirst({ where: { id } }); // ✅
   await db.query(`SELECT * WHERE id = ${id}`); // ❌
   ```

5. **Keep dependencies updated**
   ```bash
   npm audit
   npm update
   ```

### For Operations

1. **Rotate credentials regularly**
   - Database passwords: Every 90 days
   - API keys: Every 180 days
   - SSL certificates: Auto-renewed

2. **Monitor logs**
   - Check daily for anomalies
   - Set up alerts for errors
   - Review audit logs weekly

3. **Backup regularly**
   - Verify backups work
   - Test restore procedure
   - Store offsite

4. **Principle of least privilege**
   - Grant minimum necessary permissions
   - Review permissions quarterly
   - Revoke unused access

---

## Security Checklist

### Pre-Deployment
- [ ] No hardcoded secrets
- [ ] Environment variables configured
- [ ] SSL certificates valid
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Authentication implemented
- [ ] Authorization rules defined
- [ ] Input validation complete
- [ ] Error messages don't leak info
- [ ] Logs don't contain sensitive data

### Post-Deployment
- [ ] Penetration testing completed
- [ ] Vulnerability scan passed
- [ ] Monitoring configured
- [ ] Incident response plan ready
- [ ] Backup/restore tested
- [ ] Security training completed
- [ ] Documentation updated

---

## Reporting Security Issues

**DO NOT** open public GitHub issues for security vulnerabilities.

**Instead**:
1. Email: security@spendflo.com (to be set up)
2. Include:
   - Vulnerability description
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

**We commit to**:
- Acknowledge within 24 hours
- Provide status update within 1 week
- Credit reporter (if desired)
- Notify when fixed

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Next.js Security](https://nextjs.org/docs/advanced-features/security-headers)
- [Prisma Security](https://www.prisma.io/docs/concepts/components/prisma-client/security)
- [Railway Security](https://docs.railway.app/reference/security)
- [GDPR Compliance](https://gdpr.eu/)
