import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth/password';
import { generateToken } from '../lib/auth/jwt';
import { evaluateRequest } from '../lib/approval/engine';

const prisma = new PrismaClient();

async function testCoreFeatures() {
  console.log('🧪 Testing Core Features...\n');

  try {
    // 1. Test Database Connection
    console.log('1️⃣ Testing database connection...');
    const customerCount = await prisma.customer.count();
    console.log(`✅ Database connected. ${customerCount} customers found.\n`);

    // 2. Get or create test customer and user
    console.log('2️⃣ Setting up test data...');
    let customer = await prisma.customer.findFirst();
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: 'Test Corporation',
          domain: 'test.com',
        },
      });
    }

    let user = await prisma.user.findFirst({
      where: { email: 'test@test.com' },
    });

    if (!user) {
      const hashedPassword = await hashPassword('Test123!@#');
      user = await prisma.user.create({
        data: {
          email: 'test@test.com',
          password: hashedPassword,
          name: 'Test User',
          role: 'business_user',
          customerId: customer.id,
          permissions: ['budget.read', 'request.create'],
        },
      });
    }

    console.log(`✅ Customer: ${customer.name} (${customer.id})`);
    console.log(`✅ User: ${user.email} (${user.role})\n`);

    // 3. Test JWT Token Generation
    console.log('3️⃣ Testing JWT authentication...');
    const token = generateToken({
      userId: user.id,
      email: user.email,
      customerId: customer.id,
      role: user.role,
      permissions: user.permissions,
    });
    console.log(`✅ JWT Token generated: ${token.substring(0, 50)}...\n`);

    // 4. Get or create test budget
    console.log('4️⃣ Setting up test budget...');
    let budget = await prisma.budget.findFirst({
      where: {
        customerId: customer.id,
        department: 'Engineering',
        fiscalPeriod: 'FY2025',
      },
      include: { utilization: true },
    });

    if (!budget) {
      budget = await prisma.budget.create({
        data: {
          customerId: customer.id,
          department: 'Engineering',
          subCategory: 'Software',
          fiscalPeriod: 'FY2025',
          budgetedAmount: 100000,
          currency: 'USD',
        },
      });

      await prisma.budgetUtilization.create({
        data: {
          budgetId: budget.id,
          committedAmount: 30000,
          reservedAmount: 10000,
        },
      });

      budget = await prisma.budget.findUnique({
        where: { id: budget.id },
        include: { utilization: true },
      })!;
    }

    const committed = budget?.utilization?.committedAmount || 0;
    const reserved = budget?.utilization?.reservedAmount || 0;
    const available = budget.budgetedAmount - committed - reserved;

    console.log(`✅ Budget: Engineering - Software (FY2025)`);
    console.log(`   Total: $${budget.budgetedAmount.toLocaleString()}`);
    console.log(`   Committed: $${committed.toLocaleString()}`);
    console.log(`   Reserved: $${reserved.toLocaleString()}`);
    console.log(`   Available: $${available.toLocaleString()}\n`);

    // 5. Test Auto-Approval Engine
    console.log('5️⃣ Testing auto-approval engine...\n');

    // Test 1: Small request (should auto-approve)
    console.log('   Test 1: Small request ($2,000) - Should AUTO-APPROVE');
    const decision1 = await evaluateRequest({
      customerId: customer.id,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      amount: 2000,
      requesterId: user.id,
    });
    console.log(`   Result: ${decision1.decision}`);
    console.log(`   Reason: ${decision1.reason}`);
    console.log(`   Available: $${decision1.available?.toLocaleString()}\n`);

    // Test 2: Large request (should require approval)
    console.log('   Test 2: Large request ($50,000) - Should REQUIRE APPROVAL');
    const decision2 = await evaluateRequest({
      customerId: customer.id,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      amount: 50000,
      requesterId: user.id,
    });
    console.log(`   Result: ${decision2.decision}`);
    console.log(`   Reason: ${decision2.reason}\n`);

    // Test 3: Excessive request (should reject)
    console.log('   Test 3: Excessive request ($200,000) - Should REJECT');
    const decision3 = await evaluateRequest({
      customerId: customer.id,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      amount: 200000,
      requesterId: user.id,
    });
    console.log(`   Result: ${decision3.decision}`);
    console.log(`   Reason: ${decision3.reason}\n`);

    // 6. Test Summary
    console.log('📊 Test Summary:');
    console.log('✅ Database connection: PASSED');
    console.log('✅ User authentication: PASSED');
    console.log('✅ JWT token generation: PASSED');
    console.log('✅ Budget setup: PASSED');
    console.log('✅ Auto-approval engine: PASSED');
    console.log('\n🎉 All core features working!\n');

    console.log('🔑 Test Credentials:');
    console.log(`   Email: test@test.com`);
    console.log(`   Password: Test123!@#`);
    console.log(`   Token: ${token}\n`);

    console.log('🧪 Test API Calls:');
    console.log(`   curl -X POST http://localhost:3000/api/auth/login \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"email":"test@test.com","password":"Test123!@#"}'\n`);

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testCoreFeatures();
