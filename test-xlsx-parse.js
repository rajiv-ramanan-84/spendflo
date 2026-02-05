/**
 * Test XLSX Parsing
 */

const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '/tmp/spendflo-budget-imports/test_customer_123_1770279974727_sample-budget-template__1_.xlsx';

console.log('Testing XLSX parsing...\n');

// Check if file exists
if (!fs.existsSync(filePath)) {
  console.error('❌ File does not exist:', filePath);
  process.exit(1);
}

console.log('✅ File exists');

// Check file stats
const stats = fs.statSync(filePath);
console.log(`✅ File size: ${stats.size} bytes`);
console.log(`✅ File readable: ${fs.accessSync(filePath, fs.constants.R_OK) === undefined}`);

// Try to read the file
try {
  console.log('\n🔍 Attempting to parse with XLSX.readFile()...\n');
  const workbook = XLSX.readFile(filePath);

  console.log('✅ XLSX.readFile() succeeded!');
  console.log(`✅ Sheet names: ${workbook.SheetNames.join(', ')}`);

  // Read first sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false
  });

  console.log(`✅ Parsed ${data.length} rows`);
  console.log('\nFirst 3 rows:');
  console.log(JSON.stringify(data.slice(0, 3), null, 2));

} catch (error) {
  console.error('❌ XLSX parsing failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
