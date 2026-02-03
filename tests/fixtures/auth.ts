import { test as base } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../lib/auth/password';

const prisma = new PrismaClient();

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  customerId: string;
}

export interface TestCustomer {
  id: string;
  name: string;
  domain: string;
}

/**
 * Extended Playwright test with authentication fixtures
 */
export const test = base.extend<{
  testUser: TestUser;
  testCustomer: TestCustomer;
  authenticatedPage: any;
}>({
  testCustomer: async ({}, use) => {
    // Create or get test customer
    let customer = await prisma.customer.findFirst({
      where: { domain: 'test-e2e.com' },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: 'E2E Test Corp',
          domain: 'test-e2e.com',
        },
      });
    }

    await use({
      id: customer.id,
      name: customer.name,
      domain: customer.domain,
    });
  },

  testUser: async ({ testCustomer }, use) => {
    const testEmail = `test-${Date.now()}@test-e2e.com`;
    const testPassword = 'Test123!@#';

    // Create test user
    const hashedPassword = await hashPassword(testPassword);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: hashedPassword,
        name: 'E2E Test User',
        role: 'fpa_admin',
        customerId: testCustomer.id,
        permissions: ['*'], // Full permissions for testing
      },
    });

    await use({
      id: user.id,
      email: testEmail,
      password: testPassword,
      name: user.name,
      role: user.role,
      customerId: user.customerId,
    });

    // Cleanup: Delete test user after test
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    // Login via API
    const response = await page.request.post('/api/auth/login', {
      data: {
        email: testUser.email,
        password: testUser.password,
      },
    });

    const { token } = await response.json();

    // Set auth cookie/header
    await page.addInitScript((token) => {
      localStorage.setItem('auth_token', token);
    }, token);

    await use(page);
  },
});

export { expect } from '@playwright/test';
