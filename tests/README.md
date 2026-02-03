# Playwright Test Suite

## Overview

Comprehensive end-to-end test suite for SpendFlo Budget application using Playwright.

## Test Coverage

### API Keys Management (`api-keys.spec.ts`)
- ✅ Page rendering and layout
- ✅ Empty state display
- ✅ Create API key flow
- ✅ Form validation
- ✅ API key display in table
- ✅ Revoke API key
- ✅ Delete API key
- ✅ Loading states
- ✅ Error handling
- ✅ Date formatting
- ✅ Responsive design
- ✅ Keyboard navigation

### Approval Engine (`approval-engine.spec.ts`)
- ✅ Budget availability checks
- ✅ Auto-approval for small requests
- ✅ Manual approval for large requests
- ✅ Rejection for excessive requests
- ✅ Pending request consideration
- ✅ Budget health checks (>90% utilization)
- ✅ Department-specific thresholds
- ✅ Budget reservation on approval
- ✅ Missing budget handling

### AI Mapping Engine (`ai-mapping.spec.ts`)
- ✅ CSV file analysis
- ✅ Column mapping suggestions
- ✅ Confidence scoring
- ✅ Required field detection
- ✅ Sample value extraction
- ✅ File statistics
- ✅ Invalid file handling
- ✅ Empty file handling
- ✅ Currency detection
- ✅ Subcategory detection

## Setup

### Install Dependencies

```bash
npm install
npx playwright install
```

### Environment Setup

Ensure `.env.local` is configured with test database:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="test-secret"
```

### Database Setup

```bash
npx prisma db push
```

## Running Tests

### Run All Tests

```bash
npx playwright test
```

### Run Specific Test File

```bash
npx playwright test tests/e2e/api-keys.spec.ts
```

### Run Tests in UI Mode

```bash
npx playwright test --ui
```

### Run Tests in Headed Mode

```bash
npx playwright test --headed
```

### Debug Tests

```bash
npx playwright test --debug
```

### Run Tests for Specific Browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Structure

### Fixtures (`tests/fixtures/`)

**auth.ts** - Authentication fixtures
- `testCustomer` - Creates test customer
- `testUser` - Creates test user with credentials
- `authenticatedPage` - Provides authenticated page context

### Helpers (`tests/helpers/`)

**api.ts** - API helper functions
- `createApiKey()` - Create API key via API
- `listApiKeys()` - List API keys
- `revokeApiKey()` - Revoke API key
- `deleteApiKey()` - Delete API key
- `checkBudget()` - Check budget availability
- `submitRequest()` - Submit budget request

### E2E Tests (`tests/e2e/`)

- `api-keys.spec.ts` - API key management tests
- `approval-engine.spec.ts` - Auto-approval tests
- `ai-mapping.spec.ts` - AI mapping tests

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '../fixtures/auth';

test.describe('Feature Name', () => {
  test('should do something', async ({ page, testUser, testCustomer }) => {
    await page.goto('/feature');

    // Your test assertions
    await expect(page.locator('h1')).toHaveText('Expected Title');
  });
});
```

### Using Fixtures

```typescript
test('with authentication', async ({
  page,
  testUser,
  testCustomer,
  authenticatedPage,
}) => {
  // testUser: { id, email, password, name, role, customerId }
  // testCustomer: { id, name, domain }
  // authenticatedPage: Pre-authenticated page instance
});
```

### Using API Helpers

```typescript
import { createApiKey } from '../helpers/api';

test('create via API', async ({ request, testUser, testCustomer }) => {
  const result = await createApiKey(request, {
    customerId: testCustomer.id,
    createdById: testUser.id,
    name: 'Test Key',
    permissions: ['budget.read'],
  });

  expect(result.success).toBe(true);
});
```

## Best Practices

### 1. Use Fixtures for Setup

```typescript
// ✅ Good
test('test name', async ({ testUser, testCustomer }) => {
  // User and customer automatically created and cleaned up
});

// ❌ Avoid
test('test name', async () => {
  // Manual user creation without cleanup
});
```

### 2. Use Proper Locators

```typescript
// ✅ Good
await page.getByRole('button', { name: 'Submit' });
await page.getByLabel('Email');
await page.getByText('Success message');

// ❌ Avoid
await page.locator('.submit-button');
await page.locator('#email-input');
```

### 3. Wait for Network Idle

```typescript
// ✅ Good
await page.goto('/page');
await page.waitForLoadState('networkidle');

// ❌ Avoid
await page.goto('/page');
// Immediately check for elements
```

### 4. Clean Up After Tests

```typescript
test.afterEach(async () => {
  // Cleanup test data
  await prisma.resource.deleteMany({ where: { testFlag: true } });
});
```

### 5. Test User Interactions

```typescript
// ✅ Test the full user flow
await page.getByRole('button', { name: 'Create' }).click();
await page.getByLabel('Name').fill('Test Name');
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByText('Success')).toBeVisible();
```

## Debugging

### View Test Trace

```bash
npx playwright show-trace trace.zip
```

### Take Screenshots

```typescript
test('debug test', async ({ page }) => {
  await page.goto('/page');
  await page.screenshot({ path: 'debug.png' });
});
```

### Pause Test Execution

```typescript
test('debug test', async ({ page }) => {
  await page.goto('/page');
  await page.pause(); // Opens Playwright Inspector
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Playwright Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Test Reports

### HTML Report

After running tests, view the HTML report:

```bash
npx playwright show-report
```

### JSON Report

Test results are saved to `test-results/results.json` for CI integration.

## Troubleshooting

### Tests Fail with Timeout

- Increase timeout in `playwright.config.ts`:
  ```typescript
  timeout: 60000, // 60 seconds
  ```

### Database Connection Issues

- Ensure database is accessible
- Run `npx prisma db push` to sync schema
- Check `.env.local` configuration

### Port Already in Use

- Stop other dev servers
- Or change port in `playwright.config.ts`:
  ```typescript
  webServer: {
    url: 'http://localhost:3002',
  },
  ```

### Flaky Tests

- Add explicit waits: `waitForLoadState('networkidle')`
- Use `waitFor()` for dynamic elements
- Increase retries in CI

## Performance

### Parallel Execution

Tests run in parallel by default. To limit workers:

```bash
npx playwright test --workers=2
```

### Test Sharding

Split tests across multiple machines:

```bash
# Machine 1
npx playwright test --shard=1/3

# Machine 2
npx playwright test --shard=2/3

# Machine 3
npx playwright test --shard=3/3
```

## Accessibility Testing

Add accessibility checks to tests:

```typescript
import { injectAxe, checkA11y } from 'axe-playwright';

test('should be accessible', async ({ page }) => {
  await page.goto('/page');
  await injectAxe(page);
  await checkA11y(page);
});
```

## Visual Regression Testing

Enable screenshots for visual comparison:

```typescript
test('visual regression', async ({ page }) => {
  await page.goto('/page');
  await expect(page).toHaveScreenshot('page.png');
});
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [CI/CD Guide](https://playwright.dev/docs/ci)
- [Debugging Guide](https://playwright.dev/docs/debug)
