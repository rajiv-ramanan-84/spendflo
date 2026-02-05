/**
 * Create test customer
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Creating test customer...');

  const customer = await prisma.customer.upsert({
    where: { id: 'test_customer_123' },
    update: {},
    create: {
      id: 'test_customer_123',
      name: 'Test Customer',
      domain: 'test.example.com'
    }
  });

  console.log('✅ Customer created/updated:', customer);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
