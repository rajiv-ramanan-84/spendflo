const https = require('https');

console.log('===== TESTING COMPLETE BUDGET REQUEST FLOW =====\n');

// Step 1: Get budgets list (simulating form load)
console.log('Step 1: Fetching budgets from /api/budgets...');
https.get('https://spendflo.vercel.app/api/budgets', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const budgets = json.budgets || [];
    const csBudgets = budgets.filter(b => b.department === 'Customer Support');

    console.log(`✓ Received ${budgets.length} total budgets`);
    console.log(`✓ Found ${csBudgets.length} Customer Support budgets\n`);

    if (csBudgets.length === 0) {
      console.log('✗ FAIL: No Customer Support budgets found');
      return;
    }

    // Step 2: Extract customerId from first budget (simulating form behavior)
    const firstBudget = csBudgets[0];
    const customerId = firstBudget.customerId;

    console.log('Step 2: Extracting customerId from first budget...');
    console.log(`  Budget ID: ${firstBudget.id}`);
    console.log(`  Department: ${firstBudget.department}`);
    console.log(`  SubCategory: ${firstBudget.subCategory}`);
    console.log(`  FiscalPeriod: ${firstBudget.fiscalPeriod}`);
    console.log(`  Amount: $${firstBudget.budgetedAmount.toLocaleString()}`);
    console.log(`  CustomerId: ${customerId || 'MISSING ❌'}\n`);

    if (!customerId) {
      console.log('✗ FAIL: customerId is missing from budget object');
      return;
    }

    console.log('✓ CustomerId extracted successfully\n');

    // Step 3: Call budget check API (simulating form submission)
    console.log('Step 3: Checking budget availability...');
    const requestBody = JSON.stringify({
      customerId: customerId,
      department: 'Customer Support',
      fiscalPeriod: 'Full Year 2025',
      amount: 100,
      currency: 'USD',
    });

    console.log('Request payload:');
    console.log(JSON.parse(requestBody));
    console.log('');

    const checkReq = https.request('https://spendflo.vercel.app/api/budget/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length,
      }
    }, (checkRes) => {
      let checkData = '';
      checkRes.on('data', chunk => checkData += chunk);
      checkRes.on('end', () => {
        const checkJson = JSON.parse(checkData);

        console.log('Response:');
        console.log(`  Success: ${checkJson.success}`);
        console.log(`  Available: ${checkJson.available}`);
        console.log(`  Reason: ${checkJson.reason}`);

        if (checkJson.budget) {
          console.log(`  Total Budgeted: $${checkJson.budget.budgetedAmount.toLocaleString()}`);
          console.log(`  Committed: $${checkJson.budget.committed.toLocaleString()}`);
          console.log(`  Available: $${checkJson.budget.available.toLocaleString()}`);
          console.log(`  Matched Budgets: ${checkJson.budget.matchedBudgets}`);
        }
        console.log('');

        // Final result
        if (checkJson.success && checkJson.available) {
          console.log('✓✓✓ SUCCESS: Complete flow works end-to-end! ✓✓✓');
          console.log('    Form can now successfully request budgets.');
        } else {
          console.log('✗✗✗ FAILURE: Budget check failed ✗✗✗');
          console.log(`    Error: ${checkJson.error || checkJson.reason}`);
        }
      });
    });

    checkReq.on('error', (err) => {
      console.error('✗ FAIL: Budget check API error:', err.message);
    });

    checkReq.write(requestBody);
    checkReq.end();
  });
}).on('error', (err) => {
  console.error('✗ FAIL: Budgets API error:', err.message);
});
