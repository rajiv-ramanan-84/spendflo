const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://neondb_owner:npg_YZo0n1fSUeKl@ep-soft-waterfall-ah4uaw2b-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    }
  }
});

async function main() {
  // Get all customers
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'asc' }
  });

  console.log('\n=== CUSTOMERS ===');
  customers.forEach((c, i) => {
    console.log(`${i+1}. ${c.name} (ID: ${c.id})`);
  });

  // Get Customer Support budgets
  const csBudgets = await prisma.budget.findMany({
    where: { department: 'Customer Support' },
    select: {
      id: true,
      customerId: true,
      department: true,
      subCategory: true,
      fiscalPeriod: true,
      budgetedAmount: true,
    }
  });

  console.log('\n=== CUSTOMER SUPPORT BUDGETS ===');
  csBudgets.forEach((b) => {
    console.log(`- ${b.department} / ${b.subCategory} / ${b.fiscalPeriod}: $${b.budgetedAmount} (Customer: ${b.customerId})`);
  });

  // Test budget check logic
  console.log('\n=== TESTING BUDGET CHECK ===');
  const defaultCustomer = await prisma.customer.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  console.log('Default customer (first by createdAt):', defaultCustomer.name, defaultCustomer.id);

  const budgetsForDefaultCustomer = await prisma.budget.findMany({
    where: {
      customerId: defaultCustomer.id,
      department: 'Customer Support',
      fiscalPeriod: 'Full Year 2025',
    }
  });

  console.log(`Budgets for ${defaultCustomer.name} / Customer Support / Full Year 2025:`, budgetsForDefaultCustomer.length);
  budgetsForDefaultCustomer.forEach((b) => {
    console.log(`  - ${b.subCategory}: $${b.budgetedAmount}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
