const https = require('https');

https.get('https://spendflo.vercel.app/api/budgets', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const budgets = json.budgets || [];
    const csBudgets = budgets.filter(b => b.department === 'Customer Support');

    console.log(`Total budgets: ${budgets.length}`);
    console.log(`Customer Support budgets: ${csBudgets.length}`);

    if (csBudgets.length > 0) {
      console.log('\n✓ Customer Support budgets found:');
      csBudgets.forEach(b => {
        console.log(`  - Department: ${b.department}`);
        console.log(`    SubCategory: ${b.subCategory}`);
        console.log(`    FiscalPeriod: ${b.fiscalPeriod}`);
        console.log(`    Amount: $${b.budgetedAmount}`);
        console.log(`    CustomerId: ${b.customerId || 'MISSING ❌'}`);
        console.log('');
      });

      // Check if customerId field exists
      if (csBudgets[0].customerId) {
        console.log('✓ SUCCESS: customerId field is present in API response');
      } else {
        console.log('✗ FAILURE: customerId field is MISSING from API response');
      }
    } else {
      console.log('\n✗ No Customer Support budgets found');
    }
  });
}).on('error', (err) => {
  console.error('Error fetching API:', err.message);
});
