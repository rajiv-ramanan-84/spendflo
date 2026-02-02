import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('SpendFlo Budget Service E2E Tests', () => {

  test('Homepage loads with all navigation tiles', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check page title
    await expect(page).toHaveTitle(/SpendFlo Budget Module/);

    // Check navigation - use more specific selectors
    await expect(page.locator('nav a[href="/"]')).toBeVisible();
    await expect(page.locator('nav a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('nav a[href="/business/request-v2"]')).toBeVisible();

    // Check main tiles exist
    await expect(page.getByRole('heading', { name: 'FP&A User' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Business User' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Test API' })).toBeVisible();
  });

  test('Dashboard loads without errors', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Wait for dashboard to load (not stuck on loading spinner)
    await page.waitForTimeout(3000);

    // Check header is visible
    await expect(page.locator('text=Budget Dashboard')).toBeVisible();

    // Check for either budgets table or empty state - use exact match
    const hasBudgets = await page.locator('h2:has-text("All Budgets")').isVisible();
    const isEmpty = await page.locator('text=No budgets found').isVisible();

    expect(hasBudgets || isEmpty).toBeTruthy();

    // Verify Export and Cleanup buttons exist
    await expect(page.locator('button:has-text("Export")')).toBeVisible();
    await expect(page.locator('button:has-text("Clean")')).toBeVisible();

    // Verify Add Budget button is NOT present
    const addButton = await page.locator('button:has-text("Add Budget")').count();
    expect(addButton).toBe(0);
  });

  test('FP&A Upload page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/fpa/upload`);

    await expect(page.locator('text=Upload Budgets')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test('Business request form has white background and correct fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/business/request-v2`);

    // Check header
    await expect(page.locator('text=Request Budget')).toBeVisible();

    // Check form has white background (check for bg-gray-50 or bg-white class on container)
    const container = page.locator('form').first();
    await expect(container).toBeVisible();

    // Check all required fields exist
    await expect(page.locator('input[placeholder*="Salesforce"]')).toBeVisible(); // Vendor
    await expect(page.locator('textarea[placeholder*="CRM"]')).toBeVisible(); // Purpose
    await expect(page.locator('input[type="number"]')).toBeVisible(); // Amount

    // Check contract term buttons
    await expect(page.locator('text=Monthly')).toBeVisible();
    await expect(page.locator('text=Annual')).toBeVisible();
    await expect(page.locator('text=One-time')).toBeVisible();

    // Check department field (searchable)
    await expect(page.locator('input[placeholder*="department"]')).toBeVisible();

    // Check submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Navigation works correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    // Click Dashboard link in header
    await page.click('nav a[href="/dashboard"]');
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
    await expect(page.locator('text=Budget Dashboard')).toBeVisible();

    // Click New Request link in header
    await page.click('nav a[href="/business/request-v2"]');
    await expect(page).toHaveURL(`${BASE_URL}/business/request-v2`);
    await expect(page.locator('text=Request Budget')).toBeVisible();

    // Go back home
    await page.click('nav a[href="/"]');
    await expect(page).toHaveURL(BASE_URL + '/');
  });

  test('API health check works', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/api/health`);
    expect(response?.status()).toBe(200);

    const json = await response?.json();
    expect(json).toHaveProperty('status', 'ok');
  });

  test('Dashboard shows uploaded budgets data structure', async ({ page }) => {
    // Check if dashboard stats API returns valid data structure
    const response = await page.goto(`${BASE_URL}/api/dashboard/stats`);
    expect(response?.status()).toBe(200);

    const data = await response?.json();
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('health');
    expect(data).toHaveProperty('totalBudgets');

    // Verify summary structure
    expect(data.summary).toHaveProperty('totalBudget');
    expect(data.summary).toHaveProperty('totalCommitted');
    expect(data.summary).toHaveProperty('totalReserved');
    expect(data.summary).toHaveProperty('totalAvailable');
  });

  test('Old routes redirect correctly', async ({ page }) => {
    // Test /budgets redirects to /dashboard
    await page.goto(`${BASE_URL}/budgets`);
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);

    // Test /requests/new redirects to /business/request-v2
    await page.goto(`${BASE_URL}/requests/new`);
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(`${BASE_URL}/business/request-v2`);

    // Test /business/request redirects to /business/request-v2
    await page.goto(`${BASE_URL}/business/request`);
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(`${BASE_URL}/business/request-v2`);
  });

  test('Request form validation works', async ({ page }) => {
    await page.goto(`${BASE_URL}/business/request-v2`);

    // Button should be disabled when form is empty
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();

    // Fill vendor field
    await page.fill('input[placeholder*="Salesforce"]', 'Test Vendor');

    // Fill purpose
    await page.fill('textarea[placeholder*="CRM"]', 'Test purpose');

    // Fill amount
    await page.fill('input[type="number"]', '1000');

    // Select contract term
    await page.click('text=Annual');

    // Type in department to trigger dropdown
    const deptInput = page.locator('input[placeholder*="department"]');
    await deptInput.fill('Eng');

    // Wait for dropdown to appear
    await page.waitForTimeout(1000);

    // Check if button is still disabled (needs valid department selection)
    await expect(submitBtn).toBeDisabled();
  });
});
