const https = require('https');

// Add cache buster to URL
const url = `https://spendflo.vercel.app/api/budgets?_cb=${Date.now()}`;

console.log('Fetching:', url);

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const budgets = json.budgets || [];
    const csBudgets = budgets.filter(b => b.department === 'Customer Support');

    console.log(`\nTotal budgets: ${budgets.length}`);
    console.log(`Customer Support budgets: ${csBudgets.length}`);

    if (csBudgets.length > 0) {
      const firstBudget = csBudgets[0];
      console.log('\nFirst Customer Support budget:');
      console.log(JSON.stringify(firstBudget, null, 2));

      if (firstBudget.customerId) {
        console.log('\n✓ SUCCESS: customerId field is present!');
        console.log(`  CustomerId: ${firstBudget.customerId}`);
      } else {
        console.log('\n✗ FAILURE: customerId still missing');
        console.log('  Deployment may not be live yet...');
      }
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
