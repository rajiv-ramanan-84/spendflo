/**
 * Budget File Validation System
 * Validates uploaded budget files and provides helpful error messages
 */

import { ColumnMapping } from '../ai/mapping-engine';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  row?: number;
  message: string;
  suggestion?: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
  };
}

/**
 * Comprehensive validation of budget file data
 */
export function validateBudgetFile(
  headers: string[],
  rows: any[][],
  mappings: ColumnMapping[],
  customerConfig?: {
    fiscalYearStart?: string;
    fiscalPeriodFormat?: string;
    departments?: string[];
  }
): ValidationResult {
  const issues: ValidationIssue[] = [];
  let validRows = 0;
  let errorRows = 0;
  let warningRows = 0;

  // 1. Validate required fields are mapped
  const requiredFields = ['department', 'fiscalPeriod', 'budgetedAmount'];
  const mappedFields = new Set(mappings.map(m => m.targetField));

  for (const field of requiredFields) {
    if (!mappedFields.has(field)) {
      issues.push({
        severity: 'error',
        field,
        message: `Required field "${field}" is not mapped`,
        suggestion: `Add a column with ${field} data, or manually map an existing column`,
        code: 'MISSING_REQUIRED_FIELD'
      });
    }
  }

  // If required fields are missing, can't validate further
  if (issues.some(i => i.code === 'MISSING_REQUIRED_FIELD')) {
    return {
      valid: false,
      issues,
      stats: {
        totalRows: rows.length - 1, // Exclude header
        validRows: 0,
        errorRows: rows.length - 1,
        warningRows: 0
      }
    };
  }

  // Create field index map
  const fieldIndexes: Record<string, number> = {};
  mappings.forEach(mapping => {
    const colIndex = headers.indexOf(mapping.sourceColumn);
    if (colIndex !== -1) {
      fieldIndexes[mapping.targetField] = colIndex;
    }
  });

  // 2. Validate data in each row
  const rowIssues = new Map<number, ValidationIssue[]>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const currentRowIssues: ValidationIssue[] = [];

    // Skip empty rows
    if (row.every(cell => !cell)) continue;

    // Validate department
    if (fieldIndexes.department !== undefined) {
      const dept = row[fieldIndexes.department];
      if (!dept || String(dept).trim() === '') {
        currentRowIssues.push({
          severity: 'error',
          field: 'department',
          row: i + 1,
          message: 'Department is empty',
          suggestion: 'Ensure every row has a department name',
          code: 'EMPTY_DEPARTMENT'
        });
      } else if (customerConfig?.departments &&
                 !customerConfig.departments.includes(String(dept).trim())) {
        currentRowIssues.push({
          severity: 'warning',
          field: 'department',
          row: i + 1,
          message: `Department "${dept}" not found in your system`,
          suggestion: `Did you mean one of: ${customerConfig.departments.join(', ')}?`,
          code: 'UNKNOWN_DEPARTMENT'
        });
      }
    }

    // Validate fiscal period
    if (fieldIndexes.fiscalPeriod !== undefined) {
      const period = String(row[fieldIndexes.fiscalPeriod] || '').trim();
      if (!period) {
        currentRowIssues.push({
          severity: 'error',
          field: 'fiscalPeriod',
          row: i + 1,
          message: 'Fiscal period is empty',
          suggestion: 'Add a fiscal period (e.g., FY2025, Q1-2025)',
          code: 'EMPTY_FISCAL_PERIOD'
        });
      } else {
        const formatIssue = validateFiscalPeriodFormat(period, customerConfig?.fiscalPeriodFormat);
        if (formatIssue) {
          currentRowIssues.push({
            ...formatIssue,
            row: i + 1
          });
        }
      }
    }

    // Validate budgeted amount
    if (fieldIndexes.budgetedAmount !== undefined) {
      const amount = row[fieldIndexes.budgetedAmount];
      const numericAmount = parseFloat(String(amount).replace(/[,$]/g, ''));

      if (!amount || String(amount).trim() === '') {
        currentRowIssues.push({
          severity: 'error',
          field: 'budgetedAmount',
          row: i + 1,
          message: 'Budget amount is empty',
          suggestion: 'Enter a numeric amount (e.g., 500000)',
          code: 'EMPTY_AMOUNT'
        });
      } else if (isNaN(numericAmount)) {
        currentRowIssues.push({
          severity: 'error',
          field: 'budgetedAmount',
          row: i + 1,
          message: `Budget amount "${amount}" is not a valid number`,
          suggestion: 'Use numeric values only (remove symbols like $, commas are OK)',
          code: 'INVALID_AMOUNT'
        });
      } else if (numericAmount <= 0) {
        currentRowIssues.push({
          severity: 'error',
          field: 'budgetedAmount',
          row: i + 1,
          message: `Budget amount ${numericAmount} must be positive`,
          suggestion: 'Budget amounts should be greater than 0',
          code: 'NEGATIVE_AMOUNT'
        });
      } else if (numericAmount > 100000000) {
        currentRowIssues.push({
          severity: 'warning',
          field: 'budgetedAmount',
          row: i + 1,
          message: `Budget amount ${numericAmount.toLocaleString()} is very large`,
          suggestion: 'Verify this amount is correct',
          code: 'LARGE_AMOUNT'
        });
      }
    }

    // Validate currency if present
    if (fieldIndexes.currency !== undefined) {
      const currency = String(row[fieldIndexes.currency] || '').trim().toUpperCase();
      if (currency && !['USD', 'GBP', 'EUR'].includes(currency)) {
        currentRowIssues.push({
          severity: 'warning',
          field: 'currency',
          row: i + 1,
          message: `Currency "${currency}" may not be supported`,
          suggestion: 'Use USD, GBP, or EUR',
          code: 'UNSUPPORTED_CURRENCY'
        });
      }
    }

    // Track row validation status
    if (currentRowIssues.some(i => i.severity === 'error')) {
      errorRows++;
    } else if (currentRowIssues.some(i => i.severity === 'warning')) {
      warningRows++;
    } else {
      validRows++;
    }

    if (currentRowIssues.length > 0) {
      rowIssues.set(i, currentRowIssues);
      issues.push(...currentRowIssues);
    }
  }

  // 3. Check for fiscal period format consistency
  const fiscalPeriodConsistency = checkFiscalPeriodConsistency(
    rows,
    fieldIndexes.fiscalPeriod
  );
  if (fiscalPeriodConsistency) {
    issues.push(fiscalPeriodConsistency);
  }

  // 4. Check for duplicate budgets
  const duplicates = findDuplicateBudgets(rows, fieldIndexes);
  if (duplicates.length > 0) {
    duplicates.forEach(dup => issues.push(dup));
  }

  // 5. Check for temporal coverage
  const coverageIssue = checkFiscalPeriodCoverage(rows, fieldIndexes.fiscalPeriod);
  if (coverageIssue) {
    issues.push(coverageIssue);
  }

  const totalRows = rows.length - 1; // Exclude header
  const hasErrors = issues.some(i => i.severity === 'error');

  return {
    valid: !hasErrors,
    issues,
    stats: {
      totalRows,
      validRows,
      errorRows,
      warningRows
    }
  };
}

/**
 * Validate fiscal period format
 */
function validateFiscalPeriodFormat(
  period: string,
  expectedFormat?: string
): ValidationIssue | null {
  const supportedFormats = [
    { pattern: /^FY\d{4}$/, example: 'FY2025' },
    { pattern: /^FY\d{2}$/, example: 'FY25' },
    { pattern: /^Q[1-4]-\d{4}$/, example: 'Q1-2025' },
    { pattern: /^FY\d{4}-Q[1-4]$/, example: 'FY2025-Q1' },
    { pattern: /^\d{4}-Q[1-4]$/, example: '2025-Q1' },
    { pattern: /^\d{4}$/, example: '2025' }
  ];

  const matchesAnyFormat = supportedFormats.some(f => f.pattern.test(period));

  if (!matchesAnyFormat) {
    return {
      severity: 'warning',
      field: 'fiscalPeriod',
      message: `Fiscal period "${period}" format not recognized`,
      suggestion: `Use standard formats: ${supportedFormats.map(f => f.example).join(', ')}`,
      code: 'INVALID_FISCAL_PERIOD_FORMAT'
    };
  }

  return null;
}

/**
 * Check if all fiscal periods use consistent format
 */
function checkFiscalPeriodConsistency(
  rows: any[][],
  periodIndex?: number
): ValidationIssue | null {
  if (periodIndex === undefined) return null;

  const formats = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const period = String(rows[i][periodIndex] || '').trim();
    if (!period) continue;

    // Detect format
    if (/^FY\d{4}$/.test(period)) formats.add('FY2025');
    else if (/^FY\d{2}$/.test(period)) formats.add('FY25');
    else if (/^Q[1-4]-\d{4}$/.test(period)) formats.add('Q1-2025');
    else if (/^FY\d{4}-Q[1-4]$/.test(period)) formats.add('FY2025-Q1');
    else if (/^\d{4}-Q[1-4]$/.test(period)) formats.add('2025-Q1');
    else if (/^\d{4}$/.test(period)) formats.add('2025');
    else formats.add('unknown');
  }

  if (formats.size > 1) {
    return {
      severity: 'warning',
      field: 'fiscalPeriod',
      message: `Multiple fiscal period formats detected: ${Array.from(formats).join(', ')}`,
      suggestion: 'Use one consistent format throughout your file',
      code: 'INCONSISTENT_FISCAL_PERIOD_FORMAT'
    };
  }

  return null;
}

/**
 * Find duplicate budget entries
 */
function findDuplicateBudgets(
  rows: any[][],
  fieldIndexes: Record<string, number>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const dept = String(rows[i][fieldIndexes.department] || '').trim();
    const period = String(rows[i][fieldIndexes.fiscalPeriod] || '').trim();
    const subCat = fieldIndexes.subCategory !== undefined
      ? String(rows[i][fieldIndexes.subCategory] || '').trim()
      : '';

    const key = `${dept}|${period}|${subCat}`;

    if (seen.has(key)) {
      issues.push({
        severity: 'error',
        field: 'duplicate',
        row: i + 1,
        message: `Duplicate budget found (same department + fiscal period + sub-category)`,
        suggestion: `First occurrence at row ${seen.get(key)! + 1}. Combine these entries or remove duplicate.`,
        code: 'DUPLICATE_BUDGET'
      });
    } else {
      seen.set(key, i);
    }
  }

  return issues;
}

/**
 * Check if budgets cover current and next fiscal period
 */
function checkFiscalPeriodCoverage(
  rows: any[][],
  periodIndex?: number
): ValidationIssue | null {
  if (periodIndex === undefined) return null;

  const periods = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const period = String(rows[i][periodIndex] || '').trim();
    if (period) periods.add(period);
  }

  const currentYear = new Date().getFullYear();
  const hasCurrent = Array.from(periods).some(p =>
    p.includes(String(currentYear)) || p.includes(String(currentYear - 2000))
  );
  const hasNext = Array.from(periods).some(p =>
    p.includes(String(currentYear + 1)) || p.includes(String(currentYear + 1 - 2000))
  );

  if (!hasCurrent || !hasNext) {
    return {
      severity: 'warning',
      field: 'fiscalPeriod',
      message: `Budget coverage incomplete. Found periods: ${Array.from(periods).join(', ')}`,
      suggestion: `Include budgets for both ${currentYear} and ${currentYear + 1} to avoid "no budget found" errors`,
      code: 'INCOMPLETE_FISCAL_PERIOD_COVERAGE'
    };
  }

  return null;
}

/**
 * Generate user-friendly summary of validation results
 */
export function generateValidationSummary(result: ValidationResult): string {
  const { valid, issues, stats } = result;

  if (valid && issues.length === 0) {
    return `✅ All ${stats.totalRows} rows validated successfully! Ready to import.`;
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  let summary = '';

  if (errors.length > 0) {
    summary += `❌ ${errors.length} error(s) found. Please fix these before importing:\n\n`;
    errors.slice(0, 5).forEach(e => {
      summary += `  • ${e.row ? `Row ${e.row}: ` : ''}${e.message}\n`;
      if (e.suggestion) summary += `    💡 ${e.suggestion}\n`;
    });
    if (errors.length > 5) {
      summary += `  ... and ${errors.length - 5} more errors\n`;
    }
  }

  if (warnings.length > 0) {
    summary += `\n⚠️  ${warnings.length} warning(s) found. Review recommended:\n\n`;
    warnings.slice(0, 3).forEach(w => {
      summary += `  • ${w.row ? `Row ${w.row}: ` : ''}${w.message}\n`;
      if (w.suggestion) summary += `    💡 ${w.suggestion}\n`;
    });
    if (warnings.length > 3) {
      summary += `  ... and ${warnings.length - 3} more warnings\n`;
    }
  }

  summary += `\n📊 Validation Stats:\n`;
  summary += `  • Total rows: ${stats.totalRows}\n`;
  summary += `  • Valid rows: ${stats.validRows} ✅\n`;
  if (stats.warningRows > 0) summary += `  • Rows with warnings: ${stats.warningRows} ⚠️\n`;
  if (stats.errorRows > 0) summary += `  • Rows with errors: ${stats.errorRows} ❌\n`;

  return summary;
}
