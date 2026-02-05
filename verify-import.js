/**
 * Verify imported budgets
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching imported budgets...\n');

  const budgets = await prisma.budget.findMany({
    where: { customerId: 'test_customer_123' },
    orderBy: { department: 'asc' }
  });

  console.log(`✅ Found ${budgets.length} budgets:\n`);

  budgets.forEach((budget, i) => {
    console.log(`${i + 1}. ${budget.department} - ${budget.subCategory || 'N/A'}`);
    console.log(`   Period: ${budget.fiscalPeriod}`);
    console.log(`   Amount: ${budget.currency} ${budget.budgetedAmount.toLocaleString()}`);
    console.log(`   Source: ${budget.source}`);
    console.log(`   Created: ${budget.createdAt.toISOString()}\n`);
  });
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
