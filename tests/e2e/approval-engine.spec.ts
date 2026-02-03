import { test, expect } from '../fixtures/auth';
import { checkBudget, submitRequest } from '../helpers/api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test.describe('Auto-Approval Engine', () => {
  let testBudget: any;

  test.beforeEach(async ({ testCustomer }) => {
    // Create test budget with utilization
    testBudget = await prisma.budget.create({
      data: {
        customerId: testCustomer.id,
        department: 'Engineering',
        subCategory: 'Software',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 100000,
        currency: 'USD',
      },
    });

    await prisma.budgetUtilization.create({
      data: {
        budgetId: testBudget.id,
        committedAmount: 30000,
        reservedAmount: 10000,
      },
    });
  });

  test.afterEach(async () => {
    // Cleanup
    if (testBudget) {
      await prisma.budgetUtilization.deleteMany({
        where: { budgetId: testBudget.id },
      });
      await prisma.request.deleteMany({
        where: { budgetId: testBudget.id },
      });
      await prisma.budget.delete({
        where: { id: testBudget.id },
      });
    }
  });

  test('should check budget availability correctly', async ({
    request,
    testCustomer,
  }) => {
    const result = await checkBudget(request, {
      customerId: testCustomer.id,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      amount: 5000,
    });

    expect(result.isAvailable).toBe(true);
    expect(result.available).toBe(60000); // 100k - 30k committed - 10k reserved
    expect(result.canAutoApprove).toBe(true);
  });

  test('should auto-approve small requests', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    const result = await submitRequest(request, {
      customerId: testCustomer.id,
      supplier: 'Test Supplier',
      description: 'Small software purchase',
      amount: 2000,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      createdById: testUser.id,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('auto_approved');
    expect(result.budgetReserved).toBe(true);
    expect(result.reason).toContain('Auto-approved');
  });

  test('should require approval for large requests', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    const result = await submitRequest(request, {
      customerId: testCustomer.id,
      supplier: 'Test Supplier',
      description: 'Large software purchase',
      amount: 50000,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      createdById: testUser.id,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toContain('threshold');
  });

  test('should reject requests exceeding available budget', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    const result = await submitRequest(request, {
      customerId: testCustomer.id,
      supplier: 'Test Supplier',
      description: 'Excessive software purchase',
      amount: 200000,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      createdById: testUser.id,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('budget');
  });

  test('should consider pending requests in budget check', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    // Create pending request
    await prisma.request.create({
      data: {
        customerId: testCustomer.id,
        supplier: 'Pending Supplier',
        description: 'Pending request',
        amount: 20000,
        budgetCategory: 'Engineering',
        budgetId: testBudget.id,
        status: 'pending',
        createdById: testUser.id,
      },
    });

    // Check budget (should account for pending request)
    const result = await checkBudget(request, {
      customerId: testCustomer.id,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      amount: 5000,
    });

    expect(result.pendingRequests).toBe(1);
    expect(result.pendingAmount).toBe(20000);
    expect(result.available).toBe(40000); // 60k available - 20k pending
  });

  test('should block requests when budget health is critical', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    // Update budget to near capacity (>90% utilized)
    await prisma.budgetUtilization.update({
      where: { budgetId: testBudget.id },
      data: {
        committedAmount: 85000,
        reservedAmount: 10000,
      },
    });

    const result = await submitRequest(request, {
      customerId: testCustomer.id,
      supplier: 'Test Supplier',
      description: 'Request during critical budget',
      amount: 3000,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      createdById: testUser.id,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');
    expect(result.reason).toContain('critical');
  });

  test('should handle different department thresholds', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    // Create Sales budget (lower threshold: $5k)
    const salesBudget = await prisma.budget.create({
      data: {
        customerId: testCustomer.id,
        department: 'Sales',
        fiscalPeriod: 'FY2025',
        budgetedAmount: 50000,
        currency: 'USD',
      },
    });

    await prisma.budgetUtilization.create({
      data: {
        budgetId: salesBudget.id,
        committedAmount: 0,
        reservedAmount: 0,
      },
    });

    // $6k should require approval for Sales (threshold: $5k)
    const result = await submitRequest(request, {
      customerId: testCustomer.id,
      supplier: 'Test Supplier',
      description: 'Sales request',
      amount: 6000,
      department: 'Sales',
      fiscalPeriod: 'FY2025',
      createdById: testUser.id,
    });

    expect(result.status).toBe('pending');
    expect(result.reason).toContain('threshold');

    // Cleanup
    await prisma.budgetUtilization.deleteMany({
      where: { budgetId: salesBudget.id },
    });
    await prisma.request.deleteMany({
      where: { budgetId: salesBudget.id },
    });
    await prisma.budget.delete({
      where: { id: salesBudget.id },
    });
  });

  test('should return budget not found for missing budgets', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    const result = await submitRequest(request, {
      customerId: testCustomer.id,
      supplier: 'Test Supplier',
      description: 'Request for nonexistent budget',
      amount: 1000,
      department: 'NonExistent',
      fiscalPeriod: 'FY2025',
      createdById: testUser.id,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('rejected');
    expect(result.reason).toContain('No budget found');
  });

  test('should reserve budget on auto-approval', async ({
    request,
    testCustomer,
    testUser,
  }) => {
    // Submit auto-approvable request
    const result = await submitRequest(request, {
      customerId: testCustomer.id,
      supplier: 'Test Supplier',
      description: 'Request to reserve budget',
      amount: 3000,
      department: 'Engineering',
      subCategory: 'Software',
      fiscalPeriod: 'FY2025',
      createdById: testUser.id,
    });

    expect(result.status).toBe('auto_approved');

    // Check utilization increased
    const utilization = await prisma.budgetUtilization.findUnique({
      where: { budgetId: testBudget.id },
    });

    expect(utilization?.reservedAmount).toBe(13000); // 10k + 3k
  });
});
