/**
 * Test Direct Sync
 *
 * Run this to test the sync directly and see detailed errors
 */

async function testDirectSync() {
  const customerId = 'test_customer_123';

  console.log('🔍 Testing direct sync...\n');

  // Step 1: Check if file exists
  const fs = require('fs');
  const uploadDir = '/tmp/spendflo-budget-imports';

  if (!fs.existsSync(uploadDir)) {
    console.error('❌ Upload directory does not exist:', uploadDir);
    return;
  }

  const files = fs.readdirSync(uploadDir);
  console.log(`📁 Files in upload directory (${files.length}):`);
  files.forEach(f => {
    const stats = fs.statSync(`${uploadDir}/${f}`);
    console.log(`   - ${f} (${(stats.size / 1024).toFixed(2)} KB)`);
  });

  const customerFiles = files.filter(f => f.startsWith(customerId));
  if (customerFiles.length === 0) {
    console.error(`\n❌ No files found for customer: ${customerId}`);
    return;
  }

  console.log(`\n✅ Found ${customerFiles.length} file(s) for ${customerId}`);

  // Step 2: Test direct sync API
  console.log('\n🚀 Calling /api/sync/direct...\n');

  try {
    const response = await fetch('http://localhost:3000/api/sync/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId })
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ SYNC SUCCESS!\n');
      console.log('📊 Results:');
      console.log(`   Status: ${data.status}`);
      console.log(`   Duration: ${data.duration}`);
      console.log(`   Stats:`, data.stats);
      console.log(`   File: ${data.file.name} (${(data.file.size / 1024).toFixed(2)} KB)`);
    } else {
      console.log('❌ SYNC FAILED!\n');
      console.log('Error:', data.error);
      console.log('Details:', data.details);
      if (data.stack) {
        console.log('\nStack trace:');
        console.log(data.stack);
      }
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

testDirectSync().catch(console.error);
