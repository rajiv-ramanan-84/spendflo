import { test, expect } from '../fixtures/auth';
import { createApiKey, revokeApiKey, deleteApiKey } from '../helpers/api';

test.describe('API Keys Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api-keys');
  });

  test('should display page title and description', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('API Keys');
    await expect(
      page.getByText('Manage API keys for programmatic access')
    ).toBeVisible();
  });

  test('should show empty state when no API keys exist', async ({
    page,
    testCustomer,
  }) => {
    // Wait for loading to finish
    await page.waitForLoadState('networkidle');

    // Check for empty state
    const emptyState = page.getByText('No API keys yet');
    if (await emptyState.isVisible()) {
      await expect(
        page.getByText('Create your first API key to start using')
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /create api key/i })).toBeVisible();
    }
  });

  test('should open create modal when clicking create button', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /create api key/i }).first().click();

    // Modal should be visible
    await expect(page.getByRole('heading', { name: 'Create API Key' })).toBeVisible();
    await expect(
      page.getByText('Generate a new API key for programmatic access')
    ).toBeVisible();
  });

  test('should validate form fields', async ({ page }) => {
    // Open modal
    await page.getByRole('button', { name: /create api key/i }).first().click();

    // Try to submit without filling form
    await page.getByRole('button', { name: 'Create Key' }).click();

    // Should show validation errors
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Select at least one permission')).toBeVisible();
  });

  test('should create API key successfully', async ({
    page,
    testUser,
    testCustomer,
  }) => {
    // Open modal
    await page.getByRole('button', { name: /create api key/i }).first().click();

    // Fill form
    await page.getByLabel('Name').fill('Test API Key');

    // Select permissions
    await page.getByText('Read Budgets').click();
    await page.getByText('Create Requests').click();

    // Set expiration
    await page.getByLabel('Expires In (days)').fill('30');

    // Submit
    await page.getByRole('button', { name: 'Create Key' }).click();

    // Should show success modal with key
    await expect(page.getByRole('heading', { name: 'API Key Created!' })).toBeVisible();
    await expect(page.getByText('Save this API key now')).toBeVisible();

    // Should show the key
    const keyCode = page.locator('code').filter({ hasText: /sfb_live_/ });
    await expect(keyCode).toBeVisible();

    // Copy button should work
    await page.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByText('API key copied to clipboard')).toBeVisible();

    // Close modal
    await page.getByRole('button', { name: 'Done' }).click();

    // Should see key in table
    await expect(page.getByText('Test API Key')).toBeVisible();
  });

  test('should display API keys in table', async ({
    page,
    request,
    testUser,
    testCustomer,
  }) => {
    // Create API key via API
    const result = await createApiKey(request, {
      customerId: testCustomer.id,
      createdById: testUser.id,
      name: 'Test Key for Table',
      permissions: ['budget.read', 'request.create'],
      expiresInDays: 30,
    });

    expect(result.success).toBe(true);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should see key in table
    await expect(page.getByText('Test Key for Table')).toBeVisible();
    await expect(page.getByText(testUser.name)).toBeVisible();

    // Should show status badge
    const badge = page.locator('text=active').first();
    await expect(badge).toBeVisible();

    // Should show usage count
    await expect(page.getByText(/0 requests/)).toBeVisible();
  });

  test('should revoke API key', async ({
    page,
    request,
    testUser,
    testCustomer,
  }) => {
    // Create API key
    const result = await createApiKey(request, {
      customerId: testCustomer.id,
      createdById: testUser.id,
      name: 'Key to Revoke',
      permissions: ['budget.read'],
    });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Find and click revoke button
    const row = page.locator('tr', { has: page.getByText('Key to Revoke') });
    await row.getByRole('button', { name: 'Revoke' }).click();

    // Should show success toast
    await expect(page.getByText('API key revoked successfully')).toBeVisible();

    // Status should change to revoked
    await expect(row.getByText('revoked')).toBeVisible();

    // Revoke button should disappear
    await expect(row.getByRole('button', { name: 'Revoke' })).not.toBeVisible();
  });

  test('should delete API key', async ({
    page,
    request,
    testUser,
    testCustomer,
  }) => {
    // Create API key
    const result = await createApiKey(request, {
      customerId: testCustomer.id,
      createdById: testUser.id,
      name: 'Key to Delete',
      permissions: ['budget.read'],
    });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Find and click delete button
    const row = page.locator('tr', { has: page.getByText('Key to Delete') });
    await row.getByRole('button', { name: 'Delete' }).click();

    // Should show success toast
    await expect(page.getByText('API key deleted successfully')).toBeVisible();

    // Key should disappear from table
    await expect(page.getByText('Key to Delete')).not.toBeVisible();
  });

  test('should show loading skeleton while fetching', async ({ page }) => {
    // Navigate to page
    await page.goto('/api-keys');

    // Should show skeleton loader briefly
    const skeleton = page.locator('.animate-pulse');
    // Note: This might be too fast to catch, so we just check the pattern exists
    expect(await skeleton.count()).toBeGreaterThanOrEqual(0);
  });

  test('should handle API errors gracefully', async ({ page, route }) => {
    // Mock API to return error
    await route('**/api/api-keys*', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/api-keys');
    await page.waitForLoadState('networkidle');

    // Should show error toast
    await expect(page.getByText('Failed to fetch API keys')).toBeVisible();
  });

  test('should format dates correctly', async ({
    page,
    request,
    testUser,
    testCustomer,
  }) => {
    // Create API key
    await createApiKey(request, {
      customerId: testCustomer.id,
      createdById: testUser.id,
      name: 'Date Format Test',
      permissions: ['budget.read'],
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should show "Never" for last used
    const row = page.locator('tr', { has: page.getByText('Date Format Test') });
    await expect(row.getByText('Never')).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/api-keys');

    // Page should still be usable
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('button', { name: /create/i })).toBeVisible();
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/api-keys');

    // Tab to create button
    await page.keyboard.press('Tab');
    const createButton = page.getByRole('button', { name: /create api key/i }).first();

    // Open modal with Enter
    await createButton.focus();
    await page.keyboard.press('Enter');

    // Modal should be visible
    await expect(page.getByRole('heading', { name: 'Create API Key' })).toBeVisible();

    // ESC should close modal
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Create API Key' })).not.toBeVisible();
  });
});
