const https = require('https');

const BASE_URL = 'spendflo.vercel.app';

function apiCall(path, method, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('\n=== API TEST RESULTS ===\n');

  // Test 1: Budget Check - Available
  console.log('Test 1: Budget Check - Available & Auto-Approve');
  const test1 = await apiCall('/api/budget/check', 'POST', {
    requestId: 'test-001',
    userId: 'user-123',
    userName: 'Test User',
    userEmail: 'test@test.com',
    customerId: 'test-customer-001',
    department: 'Engineering',
    subCategory: 'Software Tools',
    fiscalPeriod: 'Q1 2025',
    amount: 5000,
    vendor: 'GitHub'
  });
  console.log('Status:', test1.status);
  console.log('Available:', test1.body.available);
  console.log('Can Auto-Approve:', test1.body.canAutoApprove);
  console.log('Budget Available: $' + test1.body.budget?.available);
  console.log('Result:', test1.body.available ? '✅ PASS' : '❌ FAIL');

  // Test 2: Budget Check - Insufficient
  console.log('\nTest 2: Budget Check - Insufficient Budget');
  const test2 = await apiCall('/api/budget/check', 'POST', {
    requestId: 'test-002',
    userId: 'user-123',
    userName: 'Test User',
    userEmail: 'test@test.com',
    customerId: 'test-customer-001',
    department: 'Sales',
    subCategory: 'CRM Tools',
    fiscalPeriod: 'Q1 2025',
    amount: 5000
  });
  console.log('Status:', test2.status);
  console.log('Available:', test2.body.available);
  console.log('Reason:', test2.body.reason);
  console.log('Result:', !test2.body.available ? '✅ PASS' : '❌ FAIL');

  // Test 3: Budget Check - Aggregate Multiple SubCategories
  console.log('\nTest 3: Budget Check - Aggregate HR Budgets');
  const test3 = await apiCall('/api/budget/check', 'POST', {
    requestId: 'test-003',
    userId: 'user-123',
    userName: 'Test User',
    userEmail: 'test@test.com',
    customerId: 'test-customer-001',
    department: 'HR',
    fiscalPeriod: 'Q1 2025',
    amount: 10000
  });
  console.log('Status:', test3.status);
  console.log('Available:', test3.body.available);
  console.log('Matched Budgets:', test3.body.budget?.matchedBudgets);
  console.log('Total Budget: $' + test3.body.budget?.budgetedAmount);
  console.log('Result:', test3.body.budget?.matchedBudgets === 2 ? '✅ PASS' : '❌ FAIL');

  // Test 4: Budget List API
  console.log('\nTest 4: Budget List API');
  const test4 = await apiCall('/api/budgets?customerId=test-customer-001', 'GET');
  console.log('Status:', test4.status);
  console.log('Success:', test4.body.success);
  console.log('Budget Count:', test4.body.budgets?.length);
  console.log('Has CustomerId:', test4.body.budgets?.[0]?.customerId ? 'Yes' : 'No');
  console.log('Result:', test4.body.budgets?.length > 0 ? '✅ PASS' : '❌ FAIL');

  // Test 5: Budget Reserve
  console.log('\nTest 5: Budget Reserve');
  const test5 = await apiCall('/api/budget/reserve', 'POST', {
    budgetId: 'test-budget-001',
    amount: 3000,
    requestId: 'test-005',
    reason: 'Test reservation'
  });
  console.log('Status:', test5.status);
  console.log('Success:', test5.body.success);
  console.log('Amount Reserved: $' + test5.body.amount);
  console.log('New Available: $' + test5.body.newAvailable);
  console.log('Result:', test5.body.success ? '✅ PASS' : '❌ FAIL');

  console.log('\n=== TEST COMPLETE ===\n');
}

runTests().catch(console.error);
