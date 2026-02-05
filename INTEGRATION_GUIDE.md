# Spendflo Integration Guide - Budget System

This guide explains how to integrate the Budget Sync System into Spendflo's existing codebase.

## Overview

The Budget Sync System is designed to be **plug-and-play** with Spendflo's existing authentication and user management. All user information is extracted **server-side** from your existing session/auth system.

---

## 🔐 Authentication Integration

### Step 1: Update User Extraction Utility

**File to modify:** `lib/auth/getUserFromRequest.ts`

Replace the placeholder implementation with your actual auth logic:

#### Option A: NextAuth.js
```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function getUserFromRequest(req: NextRequest): Promise<SpendFloUser | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    customerId: session.user.organizationId, // Map to your field name
    department: session.user.department,
    role: session.user.role,
  };
}
```

#### Option B: Clerk
```typescript
import { auth, currentUser } from "@clerk/nextjs";

export async function getUserFromRequest(req: NextRequest): Promise<SpendFloUser | null> {
  const { userId } = auth();
  if (!userId) return null;

  const user = await currentUser();

  return {
    id: user.id,
    email: user.emailAddresses[0].emailAddress,
    name: user.fullName || user.firstName || 'Unknown',
    customerId: user.publicMetadata.organizationId as string,
    department: user.publicMetadata.department as string,
    role: user.publicMetadata.role as string,
  };
}
```

#### Option C: Custom JWT/Session
```typescript
import jwt from 'jsonwebtoken';
import { getSessionFromRedis } from '@/lib/session';

export async function getUserFromRequest(req: NextRequest): Promise<SpendFloUser | null> {
  // Option C1: JWT from cookie
  const token = req.cookies.get('spendflo_token')?.value;
  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

  return {
    id: decoded.userId,
    email: decoded.email,
    name: decoded.name,
    customerId: decoded.organizationId,
    department: decoded.department,
    role: decoded.role,
  };

  // Option C2: Session from Redis/DB
  // const sessionId = req.cookies.get('spendflo_sid')?.value;
  // if (!sessionId) return null;
  // const session = await getSessionFromRedis(sessionId);
  // return session.user;
}
```

---

## 📊 API Endpoints Using Authentication

The following APIs automatically extract user information server-side:

### 1. `/api/budget/reserve` (Updated)
- **Before:** Accepted `userId` from client (insecure ❌)
- **After:** Extracts user from session server-side (secure ✓)
- **Returns 401** if user not authenticated

```typescript
// Client-side: No userId needed
await fetch('/api/budget/reserve', {
  method: 'POST',
  body: JSON.stringify({
    budgetId: 'xxx',
    amount: 5000,
    reason: 'Slack subscription',
  }),
});

// Server-side: Automatically extracts user
const user = await getUserFromRequest(req); // From session
// Uses: user.id, user.name, user.email for audit logs
```

### 2. Other APIs (Optional Enhancement)
Consider adding authentication to:
- `/api/budget/check` - Track who checked budgets
- `/api/budgets` - Filter budgets by user's organization
- `/api/budget/suggest` - Track AI suggestions per user

---

## 🎨 Frontend Component Integration

### Option 1: Direct Import (Simplest)
If your app uses Next.js App Router with server components:

```typescript
// In your Spendflo app
import BudgetRequestForm from '@/app/business/request-v2/page';

export default function YourPage() {
  return (
    <div>
      <h1>Request Budget</h1>
      <BudgetRequestForm />
    </div>
  );
}
```

The form automatically inherits session from cookies - no props needed!

### Option 2: Custom Wrapper (More Control)
If you want to pre-populate fields or add custom logic:

```typescript
// app/spendflo/budget-request/page.tsx
'use client';

import { useUser } from '@/hooks/useUser'; // Your existing hook
import BudgetRequestForm from '@/app/business/request-v2/page';

export default function SpendfloBudgetRequest() {
  const { user } = useUser(); // Get user from your context

  if (!user) {
    return <div>Please log in to request budgets</div>;
  }

  return (
    <div>
      <div className="mb-4">
        <p>Requesting as: {user.name} ({user.email})</p>
        <p>Department: {user.department}</p>
      </div>

      <BudgetRequestForm />
    </div>
  );
}
```

### Option 3: Props-Based (If You Want to Pre-fill Form)
If you want to pass user department to pre-select it:

Modify `app/business/request-v2/page.tsx`:
```typescript
interface Props {
  initialDepartment?: string;
  initialCustomerId?: string;
}

export default function BusinessRequestV2Page({
  initialDepartment,
  initialCustomerId
}: Props = {}) {
  const [department, setDepartment] = useState(initialDepartment || '');
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  // ... rest of code
}
```

Then use it:
```typescript
<BudgetRequestForm
  initialDepartment={user.department}
  initialCustomerId={user.organizationId}
/>
```

---

## 🗄️ Database Schema Considerations

### Customer Mapping
Ensure your `Customer` table has mapping to Spendflo users:

```sql
-- Check if you need to add mapping
SELECT * FROM "Customer" LIMIT 5;

-- Expected fields:
-- id: Matches user.customerId / user.organizationId
-- name: Organization name
-- Other budget-related fields
```

If your org structure is different:
```typescript
// In getUserFromRequest.ts
return {
  id: user.id,
  email: user.email,
  name: user.name,
  customerId: user.companyId, // ← Map to your actual field
  department: user.team,      // ← Map to your actual field
  role: user.accessLevel,     // ← Map to your actual field
};
```

---

## 🧪 Testing the Integration

### 1. Development Testing (Mock User)
The current implementation has a mock user for development:

```typescript
// lib/auth/getUserFromRequest.ts (current)
return {
  id: 'dev-user-123',
  email: 'dev@spendflo.com',
  name: 'Development User',
  customerId: 'cml7sl8ph00008j2nk5qr8zxn',
  department: 'Engineering',
  role: 'employee',
};
```

Keep this for local testing, then replace in production.

### 2. Integration Testing Checklist
```bash
# Test 1: User Extraction
curl -X POST http://localhost:3000/api/budget/reserve \
  -H "Cookie: your_session_cookie" \
  -H "Content-Type: application/json" \
  -d '{"budgetId":"xxx","amount":100,"reason":"test"}'
# Should return 401 if no session, or succeed with user info

# Test 2: Audit Log
# Submit a budget request, then check audit logs:
SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 5;
# changedBy should show: "John Doe (john@spendflo.com)"

# Test 3: Form Submission
# 1. Log in to Spendflo
# 2. Navigate to budget request form
# 3. Submit a request
# 4. Check audit log has your actual user info
```

### 3. Production Rollout
1. **Stage 1**: Deploy with mock user enabled (test in staging)
2. **Stage 2**: Update `getUserFromRequest` with real auth
3. **Stage 3**: Deploy to production
4. **Stage 4**: Verify audit logs show real user names

---

## 🔒 Security Improvements

### Current State
- ✓ User extracted server-side (not from client)
- ✓ Authentication required for budget reservation
- ✓ Audit logs track who made changes

### Recommended Enhancements
1. **Add authentication to all budget APIs**:
   ```typescript
   // app/api/budgets/route.ts
   const user = await getUserFromRequest(req);
   if (!user) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }

   // Filter budgets by user's organization
   const budgets = await prisma.budget.findMany({
     where: { customerId: user.customerId }, // Only their org's budgets
   });
   ```

2. **Add role-based access control**:
   ```typescript
   if (user.role !== 'admin' && user.role !== 'finance') {
     return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   }
   ```

3. **Add rate limiting** for budget checks
4. **Add request validation** for amounts (min/max)

---

## 🚀 Deployment Checklist

Before deploying to Spendflo production:

- [ ] Update `lib/auth/getUserFromRequest.ts` with Spendflo's auth
- [ ] Test authentication works in staging
- [ ] Verify audit logs show real user info
- [ ] Update environment variables if needed
- [ ] Test budget request form end-to-end
- [ ] Verify budget reservation works
- [ ] Check database connections
- [ ] Test with multiple users/organizations
- [ ] Remove development mock user
- [ ] Update documentation with your auth approach

---

## 📝 Summary

### What You Need to Do:
1. **Implement `getUserFromRequest()`** with Spendflo's auth (5-10 lines)
2. **Deploy** - Everything else is already wired up
3. **Test** - Verify audit logs show real users

### What's Already Done:
- ✓ Server-side user extraction pattern
- ✓ API endpoints updated to use session auth
- ✓ Client-side forms no longer send userId
- ✓ Audit logs use authenticated user info
- ✓ Mock user for development/testing

### Expected Result:
- User logs into Spendflo → Session established
- User navigates to budget request form
- User submits request
- API extracts user from session automatically
- Audit log records: "Jane Doe (jane@acme.com) reserved $5,000"

---

## ❓ Questions?

If you need help with:
- Specific auth library integration
- Database schema mapping
- Custom requirements
- Security enhancements

Let me know which auth system Spendflo uses, and I can provide more specific code examples.
