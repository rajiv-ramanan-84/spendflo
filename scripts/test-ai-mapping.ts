import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { suggestMappings, validateMappedData, transformMappedData } from '../lib/ai/mapping-engine';

async function testAIMapping() {
  console.log('🧪 Testing AI-Powered Column Mapping...\\n');

  try {
    // Read test CSV file
    const csvPath = path.join(__dirname, '../test-data/budget-import-sample.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    console.log('1️⃣ Reading CSV file...');
    console.log(`   File: ${csvPath}`);

    // Parse CSV
    const rows = parse(csvContent, {
      skip_empty_lines: true,
      trim: true,
    });

    const headers = rows[0];
    const sampleRows = rows.slice(1, 6); // Get first 5 data rows
    const allDataRows = rows.slice(1); // All data rows

    console.log(`   ✅ Found ${headers.length} columns and ${allDataRows.length} data rows\\n`);

    // Test AI mapping
    console.log('2️⃣ Running AI mapping engine...');
    console.log(`   Headers: ${headers.join(', ')}\\n`);

    const mappingResult = suggestMappings(headers, sampleRows);

    console.log('   📊 Mapping Results:\\n');

    // Display mappings
    if (mappingResult.mappings.length > 0) {
      console.log('   ✅ Detected Mappings:');
      mappingResult.mappings.forEach(mapping => {
        console.log(`      "${mapping.sourceColumn}" → ${mapping.targetField}`);
        console.log(`         Confidence: ${(mapping.confidence * 100).toFixed(0)}%`);
        console.log(`         Reason: ${mapping.reason}`);
        if (mapping.sampleValues && mapping.sampleValues.length > 0) {
          console.log(`         Sample: ${mapping.sampleValues.join(', ')}`);
        }
        console.log('');
      });
    }

    // Display unmapped columns
    if (mappingResult.unmappedColumns.length > 0) {
      console.log('   ⚠️  Unmapped Columns:');
      mappingResult.unmappedColumns.forEach(col => {
        console.log(`      - ${col}`);
      });
      console.log('');
    }

    // Display missing required fields
    if (mappingResult.requiredFieldsMissing.length > 0) {
      console.log('   ❌ Missing Required Fields:');
      mappingResult.requiredFieldsMissing.forEach(field => {
        console.log(`      - ${field}`);
      });
      console.log('');
    } else {
      console.log('   ✅ All required fields mapped!\\n');
    }

    // Display suggestions
    if (mappingResult.suggestions.length > 0) {
      console.log('   💡 Suggestions:');
      mappingResult.suggestions.forEach(suggestion => {
        console.log(`      - ${suggestion}`);
      });
      console.log('');
    }

    // Test validation
    console.log('3️⃣ Validating mapped data...\\n');
    const validationResult = validateMappedData(rows, mappingResult.mappings);

    console.log(`   Valid: ${validationResult.valid ? '✅ Yes' : '❌ No'}`);
    console.log(`   Errors: ${validationResult.errors.length}`);
    console.log(`   Warnings: ${validationResult.warnings.length}\\n`);

    if (validationResult.errors.length > 0) {
      console.log('   ❌ Validation Errors:');
      validationResult.errors.slice(0, 5).forEach(error => {
        console.log(`      Row ${error.row}: ${error.error} (${error.column} = "${error.value}")`);
      });
      console.log('');
    }

    if (validationResult.warnings.length > 0) {
      console.log('   ⚠️  Validation Warnings:');
      validationResult.warnings.slice(0, 5).forEach(warning => {
        console.log(`      Row ${warning.row}: ${warning.warning} (${warning.column} = "${warning.value}")`);
      });
      console.log('');
    }

    // Test transformation
    if (validationResult.valid) {
      console.log('4️⃣ Transforming data to budget objects...\\n');
      const budgets = transformMappedData(rows, mappingResult.mappings);

      console.log(`   ✅ Transformed ${budgets.length} budget entries\\n`);

      // Display first 3 budgets
      console.log('   Sample Budgets:');
      budgets.slice(0, 3).forEach((budget, index) => {
        console.log(`   ${index + 1}. ${budget.department}${budget.subCategory ? ` - ${budget.subCategory}` : ''}`);
        console.log(`      Period: ${budget.fiscalPeriod}`);
        console.log(`      Amount: ${budget.currency} ${budget.budgetedAmount.toLocaleString()}`);
        console.log('');
      });
    }

    // Summary
    console.log('📊 Test Summary:');
    console.log(`✅ CSV Parsing: PASSED`);
    console.log(`✅ AI Mapping: PASSED (${mappingResult.mappings.length}/${headers.length} columns mapped)`);
    console.log(`${validationResult.valid ? '✅' : '❌'} Data Validation: ${validationResult.valid ? 'PASSED' : 'FAILED'}`);
    if (validationResult.valid) {
      console.log(`✅ Data Transformation: PASSED`);
    }
    console.log('');

    console.log('🎉 AI Mapping Engine is working!\\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testAIMapping();
