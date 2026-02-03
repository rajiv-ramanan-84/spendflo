import { test, expect } from '../fixtures/auth';
import * as fs from 'fs';
import * as path from 'path';

test.describe('AI Mapping Engine', () => {
  const testCsvPath = path.join(__dirname, '../../test-data/budget-import-sample.csv');

  test('should analyze CSV and suggest mappings', async ({ request }) => {
    // Read test CSV file
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    expect(result.success).toBe(true);
    expect(result.mappings).toBeDefined();
    expect(result.mappings.length).toBeGreaterThan(0);

    // Should detect department
    const deptMapping = result.mappings.find(
      (m: any) => m.targetField === 'department'
    );
    expect(deptMapping).toBeDefined();
    expect(deptMapping.confidence).toBeGreaterThan(0.5);

    // Should detect fiscal period
    const periodMapping = result.mappings.find(
      (m: any) => m.targetField === 'fiscalPeriod'
    );
    expect(periodMapping).toBeDefined();

    // Should detect budgeted amount
    const amountMapping = result.mappings.find(
      (m: any) => m.targetField === 'budgetedAmount'
    );
    expect(amountMapping).toBeDefined();
  });

  test('should detect all required fields', async ({ request }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    // Should have no missing required fields
    expect(result.requiredFieldsMissing).toEqual([]);
    expect(result.canProceed).toBe(true);
  });

  test('should provide suggestions for low confidence mappings', async ({
    request,
  }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    // Should provide suggestions
    expect(result.suggestions).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);

    // Check for low confidence mapping warnings
    const lowConfidenceMappings = result.mappings.filter(
      (m: any) => m.confidence < 0.7
    );

    if (lowConfidenceMappings.length > 0) {
      const hasLowConfidenceSuggestion = result.suggestions.some((s: string) =>
        s.includes('Low confidence')
      );
      expect(hasLowConfidenceSuggestion).toBe(true);
    }
  });

  test('should include sample values in mappings', async ({ request }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    // Each mapping should have sample values
    result.mappings.forEach((mapping: any) => {
      expect(mapping.sampleValues).toBeDefined();
      expect(Array.isArray(mapping.sampleValues)).toBe(true);
      expect(mapping.sampleValues.length).toBeGreaterThan(0);
    });
  });

  test('should return file statistics', async ({ request }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    expect(result.file).toBeDefined();
    expect(result.file.name).toBe('budget-import-sample.csv');
    expect(result.file.type).toBe('csv');
    expect(result.file.totalRows).toBeGreaterThan(0);
    expect(result.file.totalColumns).toBeGreaterThan(0);
  });

  test('should handle invalid file types', async ({ request }) => {
    const formData = new FormData();
    const blob = new Blob(['invalid content'], { type: 'text/plain' });
    formData.append('file', blob, 'test.txt');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.error).toContain('Unsupported file type');
  });

  test('should handle empty files', async ({ request }) => {
    const formData = new FormData();
    const blob = new Blob([''], { type: 'text/csv' });
    formData.append('file', blob, 'empty.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.error).toBeDefined();
  });

  test('should handle files with no headers', async ({ request }) => {
    const formData = new FormData();
    const blob = new Blob(['\n\n\n'], { type: 'text/csv' });
    formData.append('file', blob, 'no-headers.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.error).toContain('headers');
  });

  test('should detect currency column', async ({ request }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    const currencyMapping = result.mappings.find(
      (m: any) => m.targetField === 'currency'
    );
    expect(currencyMapping).toBeDefined();
    expect(currencyMapping.confidence).toBeGreaterThan(0.5);
  });

  test('should detect subcategory column', async ({ request }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    const subCategoryMapping = result.mappings.find(
      (m: any) => m.targetField === 'subCategory'
    );
    expect(subCategoryMapping).toBeDefined();
  });

  test('should provide confidence scores for all mappings', async ({ request }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    result.mappings.forEach((mapping: any) => {
      expect(mapping.confidence).toBeDefined();
      expect(mapping.confidence).toBeGreaterThanOrEqual(0);
      expect(mapping.confidence).toBeLessThanOrEqual(1);
    });
  });

  test('should provide reasons for each mapping', async ({ request }) => {
    const csvBuffer = fs.readFileSync(testCsvPath);
    const formData = new FormData();
    const blob = new Blob([csvBuffer], { type: 'text/csv' });
    formData.append('file', blob, 'budget-import-sample.csv');

    const response = await request.post('/api/imports/ai-map', {
      multipart: formData as any,
    });

    const result = await response.json();

    result.mappings.forEach((mapping: any) => {
      expect(mapping.reason).toBeDefined();
      expect(typeof mapping.reason).toBe('string');
      expect(mapping.reason.length).toBeGreaterThan(0);
    });
  });
});
