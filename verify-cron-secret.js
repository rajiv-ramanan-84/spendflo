const https = require('https');

const BASE_URL = 'spendflo.vercel.app';
const CRON_SECRET = 'Jlk2KPnQpZlbkZAp1whuiHDn4huoRCkuaR/JVbRfVSc=';

function testCron(authHeader) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: '/api/cron/sync-google-sheets',
      method: 'GET',
      headers: authHeader ? { 'Authorization': authHeader } : {}
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function verify() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          CRON_SECRET VERIFICATION                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Test 1: No Authorization Header (should fail)
  console.log('Test 1: No Authorization Header');
  console.log('Expected: 401 Unauthorized\n');
  try {
    const res1 = await testCron(null);
    console.log('Status:', res1.status);
    console.log('Response:', res1.body.error || res1.body);

    if (res1.status === 401) {
      console.log('✅ PASS - Correctly rejected unauthorized request\n');
    } else {
      console.log('❌ FAIL - Should return 401\n');
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message, '\n');
  }

  // Test 2: Wrong Secret (should fail)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Test 2: Wrong CRON_SECRET');
  console.log('Expected: 401 Unauthorized\n');
  try {
    const res2 = await testCron('Bearer wrong-secret-123');
    console.log('Status:', res2.status);
    console.log('Response:', res2.body.error || res2.body);

    if (res2.status === 401) {
      console.log('✅ PASS - Correctly rejected wrong secret\n');
    } else {
      console.log('❌ FAIL - Should return 401\n');
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message, '\n');
  }

  // Test 3: Correct Secret (should succeed or show config error)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Test 3: Correct CRON_SECRET');
  console.log('Expected: 200 OK or 500 (if no Google Sheets configured)\n');
  try {
    const res3 = await testCron(`Bearer ${CRON_SECRET}`);
    console.log('Status:', res3.status);
    console.log('Response:', JSON.stringify(res3.body, null, 2));

    if (res3.status === 200) {
      console.log('\n✅ SUCCESS - CRON_SECRET is correctly configured!');
      console.log('   Synced', res3.body.totalConfigs || 0, 'Google Sheets configurations');
    } else if (res3.status === 500 && res3.body.error === 'CRON_SECRET not configured') {
      console.log('\n❌ FAIL - CRON_SECRET is NOT set in Vercel environment variables');
      console.log('   Please add it in Vercel dashboard and redeploy');
    } else if (res3.status === 200 && res3.body.totalConfigs === 0) {
      console.log('\n✅ CRON_SECRET is configured correctly!');
      console.log('   (No Google Sheets configurations found - this is OK)');
    } else {
      console.log('\n⚠️  Unexpected response');
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    VERIFICATION COMPLETE                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Summary
  console.log('📋 Summary:');
  console.log('   • CRON_SECRET should be set in Vercel → spendflo project');
  console.log('   • Environment: Production, Preview, Development');
  console.log('   • After adding, redeploy the project');
  console.log('   • Run this script again to verify\n');
}

verify().catch(console.error);
