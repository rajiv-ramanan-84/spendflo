/**
 * AI Mapping Engine Tests
 *
 * Tests the enhanced fuzzy mapping with synthetic data from various FP&A platforms
 */

import { suggestMappingsEnhanced } from '../lib/ai/enhanced-mapping-engine';
import {
  generateGoogleSheetsStandard,
  generateGoogleSheetsAbbreviated,
  generateGoogleSheetsUnconventional,
  generateAnaplanExport,
  generateProphixExport,
  generateExcelCustomFormat,
  generateMultiCurrencyDataset,
  generateQuarterlyDataset,
  generateMinimalDataset,
  generateDatasetWithExtraColumns,
  generateDatasetWithTypos,
  datasetToArray,
  getAllSyntheticDatasets
} from '../lib/synthetic-data/generators';

describe('AI Mapping Engine - Synthetic Data Tests', () => {
  describe('Google Sheets - Standard Format', () => {
    it('should map all columns correctly with high confidence', () => {
      const dataset = generateGoogleSheetsStandard();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Assertions
      expect(result.mappings.length).toBe(5); // All 5 fields mapped
      expect(result.requiredFieldsMissing.length).toBe(0); // No missing required fields
      expect(result.confidence.overall).toBeGreaterThan(0.85); // High confidence

      // Check specific mappings
      const deptMapping = result.mappings.find(m => m.targetField === 'department');
      expect(deptMapping).toBeDefined();
      expect(deptMapping?.sourceColumn).toBe('Department');
      expect(deptMapping?.confidence).toBeGreaterThan(0.9);

      const periodMapping = result.mappings.find(m => m.targetField === 'fiscalPeriod');
      expect(periodMapping).toBeDefined();
      expect(periodMapping?.sourceColumn).toBe('Fiscal Period');
      expect(periodMapping?.confidence).toBeGreaterThan(0.9);

      const amountMapping = result.mappings.find(m => m.targetField === 'budgetedAmount');
      expect(amountMapping).toBeDefined();
      expect(amountMapping?.sourceColumn).toBe('Budgeted Amount');
      expect(amountMapping?.confidence).toBeGreaterThan(0.9);

      console.log('✅ Google Sheets Standard - All mappings correct');
      console.log(`   Overall confidence: ${Math.round(result.confidence.overall * 100)}%`);
    });
  });

  describe('Google Sheets - Abbreviated Format', () => {
    it('should detect abbreviated column names (Dept, FY, etc.)', () => {
      const dataset = generateGoogleSheetsAbbreviated();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Check mappings
      const deptMapping = result.mappings.find(m => m.targetField === 'department');
      expect(deptMapping?.sourceColumn).toBe('Dept');
      expect(deptMapping?.confidence).toBeGreaterThan(0.75);

      const fyMapping = result.mappings.find(m => m.targetField === 'fiscalPeriod');
      expect(fyMapping?.sourceColumn).toBe('FY');
      expect(fyMapping?.confidence).toBeGreaterThan(0.75);

      const budgetMapping = result.mappings.find(m => m.targetField === 'budgetedAmount');
      expect(budgetMapping?.sourceColumn).toBe('Budget');
      expect(budgetMapping?.confidence).toBeGreaterThan(0.75);

      console.log('✅ Google Sheets Abbreviated - Fuzzy logic worked');
      console.log(`   "Dept" → department (${Math.round(deptMapping!.confidence * 100)}%)`);
      console.log(`   "FY" → fiscalPeriod (${Math.round(fyMapping!.confidence * 100)}%)`);
    });
  });

  describe('Google Sheets - Unconventional Names', () => {
    it('should detect creative column names with fuzzy matching', () => {
      const dataset = generateGoogleSheetsUnconventional();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Check mappings
      const teamMapping = result.mappings.find(m => m.targetField === 'department');
      expect(teamMapping?.sourceColumn).toBe('Team');
      expect(teamMapping?.confidence).toBeGreaterThan(0.7);

      const spendingMapping = result.mappings.find(m => m.targetField === 'subCategory');
      expect(spendingMapping?.sourceColumn).toBe('What we\'re spending on');
      expect(spendingMapping?.confidence).toBeGreaterThan(0.7);

      const whenMapping = result.mappings.find(m => m.targetField === 'fiscalPeriod');
      expect(whenMapping?.sourceColumn).toBe('When');
      expect(whenMapping?.confidence).toBeGreaterThan(0.7);

      const howMuchMapping = result.mappings.find(m => m.targetField === 'budgetedAmount');
      expect(howMuchMapping?.sourceColumn).toBe('How much');
      expect(howMuchMapping?.confidence).toBeGreaterThan(0.7);

      console.log('✅ Google Sheets Unconventional - Edge case handled');
      console.log(`   "Team" → department (${Math.round(teamMapping!.confidence * 100)}%)`);
      console.log(`   "What we're spending on" → subCategory (${Math.round(spendingMapping!.confidence * 100)}%)`);
    });
  });

  describe('Anaplan Export Format', () => {
    it('should detect Anaplan-specific column names', () => {
      const dataset = generateAnaplanExport();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Check mappings
      const costCenterMapping = result.mappings.find(m => m.targetField === 'department');
      expect(costCenterMapping?.sourceColumn).toBe('Cost Center');
      expect(costCenterMapping?.confidence).toBeGreaterThan(0.75);

      const expenseTypeMapping = result.mappings.find(m => m.targetField === 'subCategory');
      expect(expenseTypeMapping?.sourceColumn).toBe('Expense Type');
      expect(expenseTypeMapping?.confidence).toBeGreaterThan(0.75);

      const planAmountMapping = result.mappings.find(m => m.targetField === 'budgetedAmount');
      expect(planAmountMapping?.sourceColumn).toBe('Plan Amount');
      expect(planAmountMapping?.confidence).toBeGreaterThan(0.75);

      console.log('✅ Anaplan Export - Platform-specific names detected');
      console.log(`   "Cost Center" → department (${Math.round(costCenterMapping!.confidence * 100)}%)`);
      console.log(`   "Plan Amount" → budgetedAmount (${Math.round(planAmountMapping!.confidence * 100)}%)`);
    });
  });

  describe('Prophix Export Format', () => {
    it('should detect Prophix cube export format', () => {
      const dataset = generateProphixExport();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Check mappings
      const orgMapping = result.mappings.find(m => m.targetField === 'department');
      expect(orgMapping?.sourceColumn).toBe('Organization');
      expect(orgMapping?.confidence).toBeGreaterThan(0.75);

      const accountMapping = result.mappings.find(m => m.targetField === 'subCategory');
      expect(accountMapping?.sourceColumn).toBe('Account');
      expect(accountMapping?.confidence).toBeGreaterThan(0.7);

      const budgetAmountMapping = result.mappings.find(m => m.targetField === 'budgetedAmount');
      expect(budgetAmountMapping?.sourceColumn).toBe('Budget_Amount');
      expect(budgetAmountMapping?.confidence).toBeGreaterThan(0.75);

      console.log('✅ Prophix Export - Underscore naming detected');
      console.log(`   "Organization" → department (${Math.round(orgMapping!.confidence * 100)}%)`);
      console.log(`   "Budget_Amount" → budgetedAmount (${Math.round(budgetAmountMapping!.confidence * 100)}%)`);
    });
  });

  describe('Multi-Currency Dataset', () => {
    it('should handle multiple currencies correctly', () => {
      const dataset = generateMultiCurrencyDataset();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Check currency mapping
      const currencyMapping = result.mappings.find(m => m.targetField === 'currency');
      expect(currencyMapping).toBeDefined();
      expect(currencyMapping?.confidence).toBeGreaterThan(0.8);

      console.log('✅ Multi-Currency - Currency field detected');
      console.log(`   "${currencyMapping?.sourceColumn}" → currency (${Math.round(currencyMapping!.confidence * 100)}%)`);
    });
  });

  describe('Minimal Dataset (Required Fields Only)', () => {
    it('should work with only required fields', () => {
      const dataset = generateMinimalDataset();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Should map all 3 required fields
      expect(result.mappings.length).toBe(3);
      expect(result.requiredFieldsMissing.length).toBe(0);

      // Should note missing optional fields
      const currencyWarning = result.suggestions.find(s => s.includes('currency'));
      expect(currencyWarning).toBeDefined();

      console.log('✅ Minimal Dataset - Required fields mapped');
      console.log(`   Suggestions: ${result.suggestions.length}`);
    });
  });

  describe('Dataset with Extra Columns', () => {
    it('should ignore extra unmapped columns', () => {
      const dataset = generateDatasetWithExtraColumns();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      // Should map 5 core fields
      expect(result.mappings.length).toBe(5);

      // Should list extra columns as unmapped
      expect(result.unmappedColumns).toContain('Notes');
      expect(result.unmappedColumns).toContain('Last Updated');
      expect(result.unmappedColumns).toContain('Approver');

      console.log('✅ Extra Columns - Ignored unmapped columns');
      console.log(`   Mapped: ${result.mappings.length}, Unmapped: ${result.unmappedColumns.length}`);
    });
  });

  describe('Dataset with Typos', () => {
    it('should detect typos in department names', () => {
      const dataset = generateDatasetWithTypos();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const knownDepartments = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Operations'];

      const result = suggestMappingsEnhanced(headers, sampleRows, {
        knownDepartments
      });

      // Should still map department
      const deptMapping = result.mappings.find(m => m.targetField === 'department');
      expect(deptMapping).toBeDefined();

      // Should detect typos
      expect(deptMapping?.typoDetected).toBe(true);
      expect(deptMapping?.suggestedCorrection).toBeDefined();

      console.log('✅ Typo Detection - Typos detected');
      console.log(`   Typo: "${deptMapping?.sampleValues?.[0]}" → Suggestion: "${deptMapping?.suggestedCorrection}"`);
    });
  });

  describe('Comprehensive Test - All Datasets', () => {
    it('should successfully map all synthetic datasets', () => {
      const datasets = getAllSyntheticDatasets();

      console.log(`\n📊 Testing ${datasets.length} synthetic datasets...\n`);

      const results = datasets.map(dataset => {
        const data = datasetToArray(dataset);
        const headers = data[0];
        const sampleRows = data.slice(1, 11);

        const result = suggestMappingsEnhanced(headers, sampleRows);

        const passed = result.requiredFieldsMissing.length === 0;

        console.log(`${passed ? '✅' : '❌'} ${dataset.name}`);
        console.log(`   Platform: ${dataset.platform}`);
        console.log(`   Confidence: ${Math.round(result.confidence.overall * 100)}%`);
        console.log(`   Mapped fields: ${result.mappings.length}/${headers.length}`);
        console.log(`   Required missing: ${result.requiredFieldsMissing.join(', ') || 'None'}`);
        console.log('');

        return { dataset, result, passed };
      });

      const passedCount = results.filter(r => r.passed).length;
      const totalCount = results.length;

      console.log(`\n📈 Overall Results: ${passedCount}/${totalCount} passed (${Math.round(passedCount/totalCount * 100)}%)\n`);

      // All should pass (required fields mapped)
      expect(passedCount).toBe(totalCount);
    });
  });

  describe('Confidence Scoring', () => {
    it('should provide detailed confidence scores', () => {
      const dataset = generateGoogleSheetsStandard();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      console.log('\n📊 Confidence Scoring:');
      console.log(`   Overall: ${Math.round(result.confidence.overall * 100)}%`);
      console.log('   By field:');

      Object.entries(result.confidence.byField).forEach(([field, conf]) => {
        console.log(`     • ${field}: ${Math.round(conf * 100)}%`);
      });

      // All required fields should have high confidence
      expect(result.confidence.byField.department).toBeGreaterThan(0.8);
      expect(result.confidence.byField.fiscalPeriod).toBeGreaterThan(0.8);
      expect(result.confidence.byField.budgetedAmount).toBeGreaterThan(0.8);
    });
  });

  describe('Suggestions and Explanations', () => {
    it('should provide helpful suggestions', () => {
      const dataset = generateMinimalDataset();
      const data = datasetToArray(dataset);
      const headers = data[0];
      const sampleRows = data.slice(1, 11);

      const result = suggestMappingsEnhanced(headers, sampleRows);

      console.log('\n💡 Suggestions:');
      result.suggestions.forEach(suggestion => {
        console.log(`   ${suggestion}`);
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('🧪 Running AI Mapping Engine Tests...\n');

  // Simple test runner
  const tests = [
    { name: 'Google Sheets Standard', fn: testGoogleSheetsStandard },
    { name: 'Google Sheets Abbreviated', fn: testGoogleSheetsAbbreviated },
    { name: 'Unconventional Names', fn: testUnconventionalNames },
    { name: 'Anaplan Export', fn: testAnaplanExport },
    { name: 'Prophix Export', fn: testProphixExport },
    { name: 'All Datasets', fn: testAllDatasets }
  ];

  tests.forEach(test => {
    try {
      test.fn();
    } catch (error: any) {
      console.error(`❌ ${test.name} failed:`, error.message);
    }
  });
}

// Helper test functions
function testGoogleSheetsStandard() {
  const dataset = generateGoogleSheetsStandard();
  const data = datasetToArray(dataset);
  const result = suggestMappingsEnhanced(data[0], data.slice(1, 11));
  console.log(`✅ Google Sheets Standard - ${result.requiredFieldsMissing.length === 0 ? 'PASS' : 'FAIL'}`);
}

function testGoogleSheetsAbbreviated() {
  const dataset = generateGoogleSheetsAbbreviated();
  const data = datasetToArray(dataset);
  const result = suggestMappingsEnhanced(data[0], data.slice(1, 11));
  console.log(`✅ Google Sheets Abbreviated - ${result.requiredFieldsMissing.length === 0 ? 'PASS' : 'FAIL'}`);
}

function testUnconventionalNames() {
  const dataset = generateGoogleSheetsUnconventional();
  const data = datasetToArray(dataset);
  const result = suggestMappingsEnhanced(data[0], data.slice(1, 11));
  console.log(`✅ Unconventional Names - ${result.requiredFieldsMissing.length === 0 ? 'PASS' : 'FAIL'}`);
}

function testAnaplanExport() {
  const dataset = generateAnaplanExport();
  const data = datasetToArray(dataset);
  const result = suggestMappingsEnhanced(data[0], data.slice(1, 11));
  console.log(`✅ Anaplan Export - ${result.requiredFieldsMissing.length === 0 ? 'PASS' : 'FAIL'}`);
}

function testProphixExport() {
  const dataset = generateProphixExport();
  const data = datasetToArray(dataset);
  const result = suggestMappingsEnhanced(data[0], data.slice(1, 11));
  console.log(`✅ Prophix Export - ${result.requiredFieldsMissing.length === 0 ? 'PASS' : 'FAIL'}`);
}

function testAllDatasets() {
  const datasets = getAllSyntheticDatasets();
  let passed = 0;

  datasets.forEach(dataset => {
    const data = datasetToArray(dataset);
    const result = suggestMappingsEnhanced(data[0], data.slice(1, 11));
    if (result.requiredFieldsMissing.length === 0) {
      passed++;
    }
  });

  console.log(`✅ All Datasets - ${passed}/${datasets.length} passed`);
}
