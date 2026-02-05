/**
 * Synthetic Data Generators for FP&A Platform Exports
 *
 * Generates realistic budget data in various formats to simulate:
 * - Google Sheets (various column naming conventions)
 * - Anaplan exports (specific format)
 * - Prophix cube exports
 * - Excel uploads (customer variations)
 *
 * Used for testing AI mapping and sync engine.
 */

export interface BudgetRow {
  [key: string]: string | number;
}

export interface SyntheticDataset {
  name: string;
  platform: string;
  format: string;
  headers: string[];
  rows: BudgetRow[];
  expectedMappings: Record<string, string>;
  description: string;
}

// Realistic department names
const DEPARTMENTS = [
  'Engineering',
  'Sales',
  'Marketing',
  'Finance',
  'HR',
  'Operations',
  'IT',
  'Legal',
  'Customer Success',
  'Product'
];

// Realistic sub-categories by department
const SUB_CATEGORIES: Record<string, string[]> = {
  'Engineering': ['Software Licenses', 'Cloud Infrastructure', 'Hardware', 'Professional Services', 'R&D Tools'],
  'Sales': ['Sales Tools', 'CRM', 'Travel & Events', 'Commissions', 'Sales Enablement'],
  'Marketing': ['Advertising', 'Marketing Tools', 'Events', 'Content Creation', 'Brand'],
  'Finance': ['Accounting Software', 'Audit & Compliance', 'Banking Fees', 'Insurance', 'Tax Software'],
  'HR': ['Recruiting Tools', 'HR Software', 'Benefits Administration', 'Training', 'Payroll Services'],
  'Operations': ['Office Supplies', 'Facilities', 'Furniture', 'Equipment', 'Utilities'],
  'IT': ['IT Infrastructure', 'Security Tools', 'Support Services', 'Telecom', 'Devices'],
  'Legal': ['Legal Software', 'Contract Management', 'Compliance Tools', 'External Counsel'],
  'Customer Success': ['CS Tools', 'Customer Surveys', 'Success Platform', 'Training Materials'],
  'Product': ['Product Management Tools', 'Analytics', 'User Testing', 'Design Tools']
};

// Fiscal periods
const FISCAL_PERIODS = ['FY2025', 'FY2026', 'Q1-2025', 'Q2-2025', 'Q3-2025', 'Q4-2025'];

// Currencies
const CURRENCIES = ['USD', 'GBP', 'EUR'];

/**
 * Generate random budget amount (realistic ranges)
 */
function generateBudgetAmount(department: string): number {
  const ranges: Record<string, [number, number]> = {
    'Engineering': [500000, 2000000],
    'Sales': [300000, 1500000],
    'Marketing': [200000, 1000000],
    'Finance': [100000, 500000],
    'HR': [150000, 600000],
    'Operations': [100000, 400000],
    'IT': [200000, 800000],
    'Legal': [100000, 400000],
    'Customer Success': [150000, 600000],
    'Product': [200000, 800000]
  };

  const [min, max] = ranges[department] || [100000, 500000];
  return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Google Sheets Format - Clean, Standard Columns
 */
export function generateGoogleSheetsStandard(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.forEach(dept => {
    const subCats = SUB_CATEGORIES[dept] || ['General'];
    subCats.slice(0, 3).forEach(subCat => {
      FISCAL_PERIODS.slice(0, 2).forEach(period => {
        rows.push({
          'Department': dept,
          'Sub-Category': subCat,
          'Fiscal Period': period,
          'Budgeted Amount': generateBudgetAmount(dept),
          'Currency': 'USD'
        });
      });
    });
  });

  return {
    name: 'Google Sheets - Standard Format',
    platform: 'Google Sheets',
    format: 'Clean, standard column names',
    headers: ['Department', 'Sub-Category', 'Fiscal Period', 'Budgeted Amount', 'Currency'],
    rows,
    expectedMappings: {
      'Department': 'department',
      'Sub-Category': 'subCategory',
      'Fiscal Period': 'fiscalPeriod',
      'Budgeted Amount': 'budgetedAmount',
      'Currency': 'currency'
    },
    description: 'Standard Google Sheets export with clear column names'
  };
}

/**
 * Google Sheets Format - Abbreviated Columns (Common)
 */
export function generateGoogleSheetsAbbreviated(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.slice(0, 5).forEach(dept => {
    const subCats = SUB_CATEGORIES[dept] || ['General'];
    subCats.slice(0, 2).forEach(subCat => {
      rows.push({
        'Dept': dept,
        'Category': subCat,
        'FY': 'FY2025',
        'Budget': generateBudgetAmount(dept),
        'Curr': 'USD'
      });
    });
  });

  return {
    name: 'Google Sheets - Abbreviated',
    platform: 'Google Sheets',
    format: 'Short column names (Dept, FY, etc.)',
    headers: ['Dept', 'Category', 'FY', 'Budget', 'Curr'],
    rows,
    expectedMappings: {
      'Dept': 'department',
      'Category': 'subCategory',
      'FY': 'fiscalPeriod',
      'Budget': 'budgetedAmount',
      'Curr': 'currency'
    },
    description: 'Common abbreviated format - AI should detect correctly'
  };
}

/**
 * Google Sheets Format - Unconventional Names (Edge Case)
 */
export function generateGoogleSheetsUnconventional(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.slice(0, 4).forEach(dept => {
    rows.push({
      'Team': dept,
      'What we\'re spending on': SUB_CATEGORIES[dept]?.[0] || 'General',
      'When': 'FY2025',
      'How much': generateBudgetAmount(dept),
      'Money type': 'USD'
    });
  });

  return {
    name: 'Google Sheets - Unconventional Names',
    platform: 'Google Sheets',
    format: 'Customer used creative column names',
    headers: ['Team', 'What we\'re spending on', 'When', 'How much', 'Money type'],
    rows,
    expectedMappings: {
      'Team': 'department',
      'What we\'re spending on': 'subCategory',
      'When': 'fiscalPeriod',
      'How much': 'budgetedAmount',
      'Money type': 'currency'
    },
    description: 'Edge case - creative column names. AI fuzzy logic should still detect.'
  };
}

/**
 * Anaplan Export Format
 * Anaplan exports typically have specific format conventions
 */
export function generateAnaplanExport(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.slice(0, 6).forEach(dept => {
    const subCats = SUB_CATEGORIES[dept] || ['General'];
    subCats.slice(0, 2).forEach(subCat => {
      rows.push({
        'Cost Center': dept,
        'Expense Type': subCat,
        'Time Period': 'FY 2025',
        'Plan Amount': generateBudgetAmount(dept),
        'Currency Code': 'USD',
        'Version': 'Budget',
        'Scenario': 'Actual'
      });
    });
  });

  return {
    name: 'Anaplan Export',
    platform: 'Anaplan',
    format: 'Anaplan standard export with extra metadata columns',
    headers: ['Cost Center', 'Expense Type', 'Time Period', 'Plan Amount', 'Currency Code', 'Version', 'Scenario'],
    rows,
    expectedMappings: {
      'Cost Center': 'department',
      'Expense Type': 'subCategory',
      'Time Period': 'fiscalPeriod',
      'Plan Amount': 'budgetedAmount',
      'Currency Code': 'currency'
    },
    description: 'Anaplan export format with Cost Center, Plan Amount, Version, Scenario columns'
  };
}

/**
 * Prophix Cube Export Format
 */
export function generateProphixExport(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.slice(0, 5).forEach(dept => {
    const subCats = SUB_CATEGORIES[dept] || ['General'];
    subCats.slice(0, 2).forEach(subCat => {
      rows.push({
        'Organization': dept,
        'Account': subCat,
        'Period': 'FY2025',
        'Budget_Amount': generateBudgetAmount(dept),
        'Currency_Code': 'USD',
        'Dimension1': 'Operating Budget',
        'Dimension2': 'Annual Plan'
      });
    });
  });

  return {
    name: 'Prophix Cube Export',
    platform: 'Prophix',
    format: 'Prophix cube export with dimensions',
    headers: ['Organization', 'Account', 'Period', 'Budget_Amount', 'Currency_Code', 'Dimension1', 'Dimension2'],
    rows,
    expectedMappings: {
      'Organization': 'department',
      'Account': 'subCategory',
      'Period': 'fiscalPeriod',
      'Budget_Amount': 'budgetedAmount',
      'Currency_Code': 'currency'
    },
    description: 'Prophix format with underscored column names and extra dimensions'
  };
}

/**
 * Excel Upload - Finance Team Custom Format
 */
export function generateExcelCustomFormat(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.forEach(dept => {
    rows.push({
      'Business Unit': dept,
      'Budget Category': SUB_CATEGORIES[dept]?.[0] || 'General',
      'Fiscal Year': 'FY2025',
      'Allocated Budget': generateBudgetAmount(dept),
      'CCY': 'USD',
      'Owner': 'Finance Team',
      'Status': 'Approved'
    });
  });

  return {
    name: 'Excel - Finance Team Custom',
    platform: 'Excel Upload',
    format: 'Custom format from finance team',
    headers: ['Business Unit', 'Budget Category', 'Fiscal Year', 'Allocated Budget', 'CCY', 'Owner', 'Status'],
    rows,
    expectedMappings: {
      'Business Unit': 'department',
      'Budget Category': 'subCategory',
      'Fiscal Year': 'fiscalPeriod',
      'Allocated Budget': 'budgetedAmount',
      'CCY': 'currency'
    },
    description: 'Custom Excel format with extra metadata (Owner, Status)'
  };
}

/**
 * Multi-Currency Dataset
 */
export function generateMultiCurrencyDataset(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  // US departments in USD
  ['Engineering', 'Sales', 'Marketing'].forEach(dept => {
    rows.push({
      'Department': dept,
      'Region': 'US',
      'Sub-Category': SUB_CATEGORIES[dept]?.[0] || 'General',
      'Fiscal Period': 'FY2025',
      'Budget Amount': generateBudgetAmount(dept),
      'Currency': 'USD'
    });
  });

  // UK departments in GBP
  ['Engineering', 'Sales'].forEach(dept => {
    rows.push({
      'Department': dept,
      'Region': 'UK',
      'Sub-Category': SUB_CATEGORIES[dept]?.[1] || 'General',
      'Fiscal Period': 'FY2025',
      'Budget Amount': Math.floor(generateBudgetAmount(dept) * 0.79), // Rough GBP conversion
      'Currency': 'GBP'
    });
  });

  // EU departments in EUR
  ['Engineering', 'Marketing'].forEach(dept => {
    rows.push({
      'Department': dept,
      'Region': 'EU',
      'Sub-Category': SUB_CATEGORIES[dept]?.[2] || 'General',
      'Fiscal Period': 'FY2025',
      'Budget Amount': Math.floor(generateBudgetAmount(dept) * 0.92), // Rough EUR conversion
      'Currency': 'EUR'
    });
  });

  return {
    name: 'Multi-Currency Budget',
    platform: 'Google Sheets',
    format: 'Global organization with multiple currencies',
    headers: ['Department', 'Region', 'Sub-Category', 'Fiscal Period', 'Budget Amount', 'Currency'],
    rows,
    expectedMappings: {
      'Department': 'department',
      'Sub-Category': 'subCategory',
      'Fiscal Period': 'fiscalPeriod',
      'Budget Amount': 'budgetedAmount',
      'Currency': 'currency'
    },
    description: 'Multi-currency dataset with regional budgets'
  };
}

/**
 * Quarterly Budget Dataset
 */
export function generateQuarterlyDataset(): SyntheticDataset {
  const rows: BudgetRow[] = [];
  const quarters = ['Q1-2025', 'Q2-2025', 'Q3-2025', 'Q4-2025'];

  DEPARTMENTS.slice(0, 5).forEach(dept => {
    const subCats = SUB_CATEGORIES[dept] || ['General'];
    subCats.slice(0, 2).forEach(subCat => {
      quarters.forEach(quarter => {
        rows.push({
          'Department': dept,
          'Expense Category': subCat,
          'Quarter': quarter,
          'Budgeted Amount': Math.floor(generateBudgetAmount(dept) / 4), // Split annual into quarters
          'Currency': 'USD'
        });
      });
    });
  });

  return {
    name: 'Quarterly Budget Plan',
    platform: 'Google Sheets',
    format: 'Quarterly budget breakdown',
    headers: ['Department', 'Expense Category', 'Quarter', 'Budgeted Amount', 'Currency'],
    rows,
    expectedMappings: {
      'Department': 'department',
      'Expense Category': 'subCategory',
      'Quarter': 'fiscalPeriod',
      'Budgeted Amount': 'budgetedAmount',
      'Currency': 'currency'
    },
    description: 'Quarterly budget plan with Q1, Q2, Q3, Q4 periods'
  };
}

/**
 * Edge Case: Missing Optional Fields
 */
export function generateMinimalDataset(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.slice(0, 5).forEach(dept => {
    rows.push({
      'Department': dept,
      'Fiscal Period': 'FY2025',
      'Amount': generateBudgetAmount(dept)
      // No sub-category, no currency (should default to USD)
    });
  });

  return {
    name: 'Minimal Budget (Required Fields Only)',
    platform: 'Excel Upload',
    format: 'Only required fields present',
    headers: ['Department', 'Fiscal Period', 'Amount'],
    rows,
    expectedMappings: {
      'Department': 'department',
      'Fiscal Period': 'fiscalPeriod',
      'Amount': 'budgetedAmount'
    },
    description: 'Minimal dataset - only required fields, no sub-category or currency'
  };
}

/**
 * Edge Case: Extra Columns (Should Ignore)
 */
export function generateDatasetWithExtraColumns(): SyntheticDataset {
  const rows: BudgetRow[] = [];

  DEPARTMENTS.slice(0, 4).forEach(dept => {
    rows.push({
      'Department': dept,
      'Sub-Category': SUB_CATEGORIES[dept]?.[0] || 'General',
      'Fiscal Period': 'FY2025',
      'Budget Amount': generateBudgetAmount(dept),
      'Currency': 'USD',
      // Extra columns that should be ignored
      'Notes': 'Budget approved by CFO',
      'Last Updated': '2025-01-15',
      'Approver': 'John Doe',
      'Budget Code': 'BDG-2025-001',
      'GL Account': '5000-1000'
    });
  });

  return {
    name: 'Dataset with Extra Columns',
    platform: 'Google Sheets',
    format: 'Budget data with extra metadata columns',
    headers: ['Department', 'Sub-Category', 'Fiscal Period', 'Budget Amount', 'Currency', 'Notes', 'Last Updated', 'Approver', 'Budget Code', 'GL Account'],
    rows,
    expectedMappings: {
      'Department': 'department',
      'Sub-Category': 'subCategory',
      'Fiscal Period': 'fiscalPeriod',
      'Budget Amount': 'budgetedAmount',
      'Currency': 'currency'
    },
    description: 'Dataset with many extra columns - AI should ignore unmapped columns'
  };
}

/**
 * Edge Case: Typos in Department Names
 */
export function generateDatasetWithTypos(): SyntheticDataset {
  const departmentsWithTypos = [
    'Enginerring', // Missing 'e'
    'Salse',       // Transposed letters
    'Maketing',    // Missing 'r'
    'Fiance',      // Missing 'n'
    'Opeations'    // Missing 'r'
  ];

  const rows: BudgetRow[] = departmentsWithTypos.map((dept, i) => ({
    'Department': dept,
    'Sub-Category': 'General',
    'Fiscal Period': 'FY2025',
    'Budget Amount': 500000,
    'Currency': 'USD',
    'Correct Name': DEPARTMENTS[i] // For reference in testing
  }));

  return {
    name: 'Dataset with Typos',
    platform: 'Excel Upload',
    format: 'Department names have typos',
    headers: ['Department', 'Sub-Category', 'Fiscal Period', 'Budget Amount', 'Currency', 'Correct Name'],
    rows,
    expectedMappings: {
      'Department': 'department',
      'Sub-Category': 'subCategory',
      'Fiscal Period': 'fiscalPeriod',
      'Budget Amount': 'budgetedAmount',
      'Currency': 'currency'
    },
    description: 'Dataset with typos in department names - should flag for review'
  };
}

/**
 * Get all synthetic datasets
 */
export function getAllSyntheticDatasets(): SyntheticDataset[] {
  return [
    generateGoogleSheetsStandard(),
    generateGoogleSheetsAbbreviated(),
    generateGoogleSheetsUnconventional(),
    generateAnaplanExport(),
    generateProphixExport(),
    generateExcelCustomFormat(),
    generateMultiCurrencyDataset(),
    generateQuarterlyDataset(),
    generateMinimalDataset(),
    generateDatasetWithExtraColumns(),
    generateDatasetWithTypos()
  ];
}

/**
 * Convert synthetic dataset to CSV string
 */
export function datasetToCSV(dataset: SyntheticDataset): string {
  const lines: string[] = [];

  // Headers
  lines.push(dataset.headers.join(','));

  // Rows
  dataset.rows.forEach(row => {
    const values = dataset.headers.map(header => {
      const value = row[header];
      // Quote strings with commas
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return String(value);
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

/**
 * Convert synthetic dataset to 2D array (for Google Sheets format)
 */
export function datasetToArray(dataset: SyntheticDataset): any[][] {
  const result: any[][] = [];

  // Headers
  result.push(dataset.headers);

  // Rows
  dataset.rows.forEach(row => {
    const values = dataset.headers.map(header => row[header]);
    result.push(values);
  });

  return result;
}
