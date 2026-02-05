const https = require('https');

https.get('https://spendflo.vercel.app/api/budgets', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const budgets = json.budgets || [];
    const csBudgets = budgets.filter(b => b.department.includes('Customer Support'));

    console.log(`Total budgets returned: ${budgets.length}`);
    console.log(`Customer Support budgets: ${csBudgets.length}`);

    if (csBudgets.length > 0) {
      console.log('\nCustomer Support budgets:');
      csBudgets.forEach(b => {
        console.log(`  - ${b.department} / ${b.fiscalPeriod} / $${b.budgetedAmount}`);
      });
    } else {
      console.log('\n❌ NO Customer Support budgets found in API response!');
      console.log('\nAll departments in response:');
      const depts = [...new Set(budgets.map(b => b.department))].sort();
      depts.forEach(d => console.log(`  - ${d}`));
    }
  });
});
