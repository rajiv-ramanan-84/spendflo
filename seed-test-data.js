const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://neondb_owner:npg_YZo0n1fSUeKl@ep-soft-waterfall-ah4uaw2b-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    }
  }
});

async function main() {
  console.log('🌱 Seeding test data...\n');

  // 1. Create test customers
  console.log('1️⃣ Creating test customers...');
  const customer1 = await prisma.customer.upsert({
    where: { domain: 'testcorp.com' },
    update: {},
    create: {
      id: 'test-customer-001',
      name: 'Test Corporation',
      domain: 'testcorp.com',
    },
  });

  const customer2 = await prisma.customer.upsert({
    where: { domain: 'democorp.com' },
    update: {},
    create: {
      id: 'test-customer-002',
      name: 'Demo Corporation',
      domain: 'democorp.com',
    },
  });
  console.log('   ✓ Created 2 customers\n');

  // 2. Create test users with different roles
  console.log('2️⃣ Creating test users...');
  const fpaUser = await prisma.user.upsert({
    where: { email: 'fpa@testcorp.com' },
    update: {},
    create: {
      id: 'test-fpa-user',
      email: 'fpa@testcorp.com',
      password: 'hashed_password',
      name: 'FPA User',
      role: 'fpa_user',
      customerId: customer1.id,
    },
  });

  const businessUser = await prisma.user.upsert({
    where: { email: 'employee@testcorp.com' },
    update: {},
    create: {
      id: 'test-employee-user',
      email: 'employee@testcorp.com',
      password: 'hashed_password',
      name: 'Employee User',
      role: 'business_user',
      customerId: customer1.id,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@testcorp.com' },
    update: {},
    create: {
      id: 'test-admin-user',
      email: 'admin@testcorp.com',
      password: 'hashed_password',
      name: 'Admin User',
      role: 'super_admin',
      customerId: customer1.id,
    },
  });
  console.log('   ✓ Created 3 users (FP&A, Employee, Admin)\n');

  // 3. Create test budgets with various scenarios
  console.log('3️⃣ Creating test budgets...');
  
  // Budget 1: Large budget, plenty available (auto-approve scenario)
  const budget1 = await prisma.budget.upsert({
    where: {
      customerId_department_subCategory_fiscalPeriod: {
        customerId: customer1.id,
        department: 'Engineering',
        subCategory: 'Software Tools',
        fiscalPeriod: 'Q1 2025',
      },
    },
    update: { budgetedAmount: 100000 },
    create: {
      id: 'test-budget-001',
      customerId: customer1.id,
      department: 'Engineering',
      subCategory: 'Software Tools',
      fiscalPeriod: 'Q1 2025',
      budgetedAmount: 100000,
      currency: 'USD',
      source: 'manual',
    },
  });

  // Budget 2: Medium budget (requires approval scenario)
  const budget2 = await prisma.budget.upsert({
    where: {
      customerId_department_subCategory_fiscalPeriod: {
        customerId: customer1.id,
        department: 'Marketing',
        subCategory: 'Advertising',
        fiscalPeriod: 'Q1 2025',
      },
    },
    update: { budgetedAmount: 50000 },
    create: {
      id: 'test-budget-002',
      customerId: customer1.id,
      department: 'Marketing',
      subCategory: 'Advertising',
      fiscalPeriod: 'Q1 2025',
      budgetedAmount: 50000,
      currency: 'USD',
      source: 'manual',
    },
  });

  // Budget 3: Small budget, nearly exhausted (insufficient budget scenario)
  const budget3 = await prisma.budget.upsert({
    where: {
      customerId_department_subCategory_fiscalPeriod: {
        customerId: customer1.id,
        department: 'Sales',
        subCategory: 'CRM Tools',
        fiscalPeriod: 'Q1 2025',
      },
    },
    update: { budgetedAmount: 10000 },
    create: {
      id: 'test-budget-003',
      customerId: customer1.id,
      department: 'Sales',
      subCategory: 'CRM Tools',
      fiscalPeriod: 'Q1 2025',
      budgetedAmount: 10000,
      currency: 'USD',
      source: 'manual',
    },
  });

  // Budget 4: Multiple sub-categories (test aggregation)
  const budget4a = await prisma.budget.upsert({
    where: {
      customerId_department_subCategory_fiscalPeriod: {
        customerId: customer1.id,
        department: 'HR',
        subCategory: 'Recruiting',
        fiscalPeriod: 'Q1 2025',
      },
    },
    update: { budgetedAmount: 30000 },
    create: {
      id: 'test-budget-004a',
      customerId: customer1.id,
      department: 'HR',
      subCategory: 'Recruiting',
      fiscalPeriod: 'Q1 2025',
      budgetedAmount: 30000,
      currency: 'USD',
      source: 'manual',
    },
  });

  const budget4b = await prisma.budget.upsert({
    where: {
      customerId_department_subCategory_fiscalPeriod: {
        customerId: customer1.id,
        department: 'HR',
        subCategory: 'Training',
        fiscalPeriod: 'Q1 2025',
      },
    },
    update: { budgetedAmount: 20000 },
    create: {
      id: 'test-budget-004b',
      customerId: customer1.id,
      department: 'HR',
      subCategory: 'Training',
      fiscalPeriod: 'Q1 2025',
      budgetedAmount: 20000,
      currency: 'USD',
      source: 'manual',
    },
  });

  console.log('   ✓ Created 5 budgets across 4 departments\n');

  // 4. Create budget utilization (reserve some budget)
  console.log('4️⃣ Creating budget utilization...');
  await prisma.budgetUtilization.upsert({
    where: { budgetId: budget3.id },
    update: { reservedAmount: 9000, committedAmount: 0 },
    create: {
      budgetId: budget3.id,
      reservedAmount: 9000, // Nearly exhausted
      committedAmount: 0,
    },
  });
  console.log('   ✓ Reserved $9,000 from Sales budget (only $1,000 left)\n');

  // 5. Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Seed complete!\n');
  console.log('📊 Test Data Summary:');
  console.log('   • Customers: 2');
  console.log('   • Users: 3 (FP&A, Employee, Admin)');
  console.log('   • Budgets: 5');
  console.log('   • Departments: 4 (Engineering, Marketing, Sales, HR)');
  console.log('');
  console.log('💰 Budget Scenarios:');
  console.log('   1. Engineering/Software Tools: $100,000 (plenty available)');
  console.log('   2. Marketing/Advertising: $50,000 (medium)');
  console.log('   3. Sales/CRM Tools: $10,000 ($9,000 reserved, only $1,000 left)');
  console.log('   4. HR/Recruiting: $30,000');
  console.log('   5. HR/Training: $20,000');
  console.log('');
  console.log('👥 Test Users:');
  console.log('   • FP&A User: fpa@testcorp.com (can release any budget)');
  console.log('   • Employee: employee@testcorp.com (can only cancel own)');
  console.log('   • Admin: admin@testcorp.com (can release any budget)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
