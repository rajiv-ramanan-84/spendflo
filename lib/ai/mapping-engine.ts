/**
 * AI-Powered Column Mapping Engine
 * Uses pattern matching and heuristics to intelligently map spreadsheet columns
 * to budget fields (department, fiscalPeriod, budgetedAmount, etc.)
 */

export interface ColumnMapping {
  sourceColumn: string; // Original column name from spreadsheet
  targetField: string; // Target field in our system
  confidence: number; // 0-1 confidence score
  reason: string; // Why this mapping was suggested
  sampleValues?: string[]; // Sample values from this column
}

export interface MappingResult {
  mappings: ColumnMapping[];
  unmappedColumns: string[];
  requiredFieldsMissing: string[];
  suggestions: string[];
  fileTypeDetection?: FileTypeDetection;
}

export interface FileTypeDetection {
  likelyFileType: 'budget' | 'payroll' | 'expenses' | 'invoice' | 'unknown';
  confidence: number; // 0-1 how confident we are about the file type
  budgetConfidence: number; // 0-1 how much this looks like a budget file
  warnings: string[];
  detectedKeywords: {
    budget: string[];
    nonBudget: string[];
  };
}

// Required fields for budget import
const REQUIRED_FIELDS = ['department', 'fiscalPeriod', 'budgetedAmount'];

// Optional fields
const OPTIONAL_FIELDS = ['subCategory', 'currency'];

// All possible target fields
const TARGET_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

/**
 * Column name patterns for each field type
 */
const FIELD_PATTERNS: Record<string, string[]> = {
  department: [
    'department',
    'dept',
    'division',
    'team',
    'business unit',
    'bu',
    'organization',
    'org',
    'org unit',
    'cost center',
  ],
  subCategory: [
    'subcategory',
    'sub-category',
    'sub category',
    'budget category',
    'expense category',
    'expense type',
    'category',
    'what we\'re spending on',
    'spending on',
    'expense',
    'sub type',
    'subtype',
  ],
  fiscalPeriod: [
    'fiscal period',
    'time period',
    'period',
    'when',
    'fiscal year',
    'fy',
    'quarter',
    'q',
    'year',
    'fiscal',
  ],
  budgetedAmount: [
    'budgeted amount',
    'budget',
    'amount',
    'how much',
    'total',
    'allocated',
    'allocation',
    'value',
    'plan amount',
  ],
  currency: [
    'currency',
    'curr',
    'ccy',
    'money type',
    'currency code',
    'currency type',
  ],
};

/**
 * Value patterns to detect field types from content
 */
const VALUE_PATTERNS = {
  department: /^(engineering|sales|marketing|finance|hr|operations|it|legal|admin)/i,
  fiscalPeriod: /^(FY|Q\d|20\d{2}|fy|q\d)/i,
  budgetedAmount: /^[\$£€]?\s*\d+[,.]?\d*/,
  currency: /^(USD|GBP|EUR|JPY|CAD|AUD)$/i,
};

/**
 * Keywords to identify different file types
 */
const FILE_TYPE_KEYWORDS = {
  budget: [
    'budget', 'budgeted', 'allocated', 'allocation', 'fiscal', 'planned',
    'forecast', 'department', 'cost center', 'opex', 'capex', 'q1', 'q2', 'q3', 'q4', 'fy'
  ],
  payroll: [
    'salary', 'payroll', 'employee', 'emp', 'wage', 'compensation', 'bonus',
    'gross pay', 'net pay', 'deduction', 'tax', 'social security', 'benefits',
    'employee id', 'emp id', 'hourly rate', 'overtime', 'timesheet'
  ],
  expenses: [
    'expense', 'reimbursement', 'receipt', 'claim', 'vendor', 'merchant',
    'transaction', 'card', 'credit card', 'purchase date', 'submitted by',
    'approver', 'expense report'
  ],
  invoice: [
    'invoice', 'bill', 'po number', 'purchase order', 'supplier', 'vendor',
    'due date', 'payment terms', 'line item', 'quantity', 'unit price',
    'invoice number', 'invoice date', 'total due', 'amount due'
  ]
};

/**
 * Analyze column headers and sample data to suggest mappings
 */
export function suggestMappings(
  headers: string[],
  sampleRows: any[][]
): MappingResult {
  const mappings: ColumnMapping[] = [];
  const unmappedColumns: string[] = [];
  const usedFields = new Set<string>();

  // Analyze each column
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const sampleValues = sampleRows.map(row => row[i]).filter(Boolean);

    const mapping = detectFieldType(header, sampleValues);

    if (mapping && !usedFields.has(mapping.targetField)) {
      mappings.push({
        sourceColumn: header,
        targetField: mapping.targetField,
        confidence: mapping.confidence,
        reason: mapping.reason,
        sampleValues: sampleValues.slice(0, 3), // First 3 samples
      });
      usedFields.add(mapping.targetField);
    } else {
      unmappedColumns.push(header);
    }
  }

  // Detect file type
  const fileTypeDetection = detectFileType(headers, sampleRows);

  // Check for missing required fields
  const mappedFields = new Set(mappings.map(m => m.targetField));
  const requiredFieldsMissing = REQUIRED_FIELDS.filter(
    field => !mappedFields.has(field)
  );

  // Generate suggestions
  const suggestions = generateSuggestions(
    mappings,
    requiredFieldsMissing,
    unmappedColumns,
    fileTypeDetection
  );

  return {
    mappings,
    unmappedColumns,
    requiredFieldsMissing,
    suggestions,
    fileTypeDetection,
  };
}

/**
 * Detect what type of file this is based on headers and content
 */
function detectFileType(headers: string[], sampleRows: any[][]): FileTypeDetection {
  const allText = [...headers, ...sampleRows.flat().map(v => String(v || ''))].join(' ').toLowerCase();

  const detectedKeywords = {
    budget: [] as string[],
    nonBudget: [] as string[]
  };

  // Count keyword matches for each file type
  const scores: Record<string, number> = {
    budget: 0,
    payroll: 0,
    expenses: 0,
    invoice: 0
  };

  // Check budget keywords
  FILE_TYPE_KEYWORDS.budget.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(allText)) {
      scores.budget += 1;
      detectedKeywords.budget.push(keyword);
    }
  });

  // Check non-budget keywords
  FILE_TYPE_KEYWORDS.payroll.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(allText)) {
      scores.payroll += 1;
      detectedKeywords.nonBudget.push(keyword);
    }
  });

  FILE_TYPE_KEYWORDS.expenses.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(allText)) {
      scores.expenses += 1;
      detectedKeywords.nonBudget.push(keyword);
    }
  });

  FILE_TYPE_KEYWORDS.invoice.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(allText)) {
      scores.invoice += 1;
      detectedKeywords.nonBudget.push(keyword);
    }
  });

  // Determine likely file type (check more specific types first)
  const maxScore = Math.max(...Object.values(scores));
  const totalNonBudgetScore = scores.payroll + scores.expenses + scores.invoice;

  let likelyFileType: FileTypeDetection['likelyFileType'] = 'unknown';
  let confidence = 0;
  const warnings: string[] = [];

  if (maxScore === 0) {
    likelyFileType = 'unknown';
    confidence = 0;
    warnings.push('Unable to determine file type - no recognizable keywords found');
  } else if (scores.budget >= scores.payroll && scores.budget >= scores.expenses && scores.budget >= scores.invoice) {
    likelyFileType = 'budget';
    confidence = Math.min(scores.budget / 5, 1.0); // Normalize to 0-1

    if (totalNonBudgetScore > 0) {
      warnings.push(
        `File appears to be a budget file, but also contains ${totalNonBudgetScore} non-budget keyword(s). Please verify this is the correct file.`
      );
    }
  } else if (scores.payroll > scores.budget && scores.payroll > scores.invoice) {
    likelyFileType = 'payroll';
    confidence = Math.min(scores.payroll / 5, 1.0);
    warnings.push(
      `⚠️ This looks like a PAYROLL file, not a budget file. Found keywords: ${detectedKeywords.nonBudget.slice(0, 5).join(', ')}`
    );
  } else if (scores.invoice > scores.budget && scores.invoice >= scores.expenses) {
    // Invoice check before expenses (more specific)
    likelyFileType = 'invoice';
    confidence = Math.min(scores.invoice / 5, 1.0);
    warnings.push(
      `⚠️ This looks like an INVOICE file, not a budget file. Found keywords: ${detectedKeywords.nonBudget.slice(0, 5).join(', ')}`
    );
  } else if (scores.expenses > scores.budget) {
    likelyFileType = 'expenses';
    confidence = Math.min(scores.expenses / 5, 1.0);
    warnings.push(
      `⚠️ This looks like an EXPENSES file, not a budget file. Found keywords: ${detectedKeywords.nonBudget.slice(0, 5).join(', ')}`
    );
  }

  const budgetConfidence = scores.budget > 0 ? Math.min(scores.budget / Math.max(totalNonBudgetScore || 1, 3), 1.0) : 0;

  return {
    likelyFileType,
    confidence,
    budgetConfidence,
    warnings,
    detectedKeywords
  };
}

/**
 * Detect field type from column header and sample values
 * Uses best-match strategy: finds all potential matches and returns the best one
 */
function detectFieldType(
  header: string,
  sampleValues: string[]
): { targetField: string; confidence: number; reason: string } | null {
  const headerLower = header.toLowerCase().trim();

  type Match = {
    field: string;
    confidence: number;
    reason: string;
    patternLength: number;
  };

  const matches: Match[] = [];

  // Check each target field
  for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
    let confidence = 0;
    let reason = '';
    let matchedPattern = '';

    // Check header match - prefer longer patterns
    for (const pattern of patterns) {
      if (headerLower.includes(pattern.toLowerCase())) {
        // Only update if this pattern is longer than previous match
        if (pattern.length > matchedPattern.length) {
          matchedPattern = pattern;
          confidence = 0.5;
          reason = `Header "${header}" matches pattern "${pattern}"`;
        }
      }
    }

    // Check value patterns
    if (sampleValues.length > 0 && VALUE_PATTERNS[field as keyof typeof VALUE_PATTERNS]) {
      const pattern = VALUE_PATTERNS[field as keyof typeof VALUE_PATTERNS];
      const matchCount = sampleValues.filter(val => pattern.test(String(val))).length;
      const matchRate = matchCount / sampleValues.length;

      if (matchRate > 0.5) {
        confidence += matchRate * 0.5;
        if (reason) {
          reason += ` and values match pattern`;
        } else {
          reason = `Values match ${field} pattern (${Math.round(matchRate * 100)}% match rate)`;
        }
      }
    }

    // Add to matches if confidence is high enough
    if (confidence >= 0.5) {
      matches.push({
        field,
        confidence: Math.min(confidence, 1.0),
        reason,
        patternLength: matchedPattern.length,
      });
    }
  }

  // No matches found
  if (matches.length === 0) {
    return null;
  }

  // Sort by confidence (desc), then by pattern length (desc)
  matches.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) > 0.01) {
      return b.confidence - a.confidence;
    }
    return b.patternLength - a.patternLength;
  });

  // Return best match
  const best = matches[0];
  return {
    targetField: best.field,
    confidence: best.confidence,
    reason: best.reason,
  };
}

/**
 * Generate helpful suggestions for the user
 */
function generateSuggestions(
  mappings: ColumnMapping[],
  missingFields: string[],
  unmappedColumns: string[],
  fileTypeDetection?: FileTypeDetection
): string[] {
  const suggestions: string[] = [];

  // File type warnings (highest priority)
  if (fileTypeDetection && fileTypeDetection.warnings.length > 0) {
    suggestions.push(...fileTypeDetection.warnings);
  }

  // Wrong file type - critical warning
  if (fileTypeDetection && fileTypeDetection.likelyFileType !== 'budget' && fileTypeDetection.likelyFileType !== 'unknown') {
    suggestions.push(
      `🚨 CRITICAL: This appears to be a ${fileTypeDetection.likelyFileType.toUpperCase()} file (confidence: ${Math.round(fileTypeDetection.confidence * 100)}%). Budget files should contain columns like department, fiscal period, and budget amounts. Please verify you uploaded the correct file.`
    );
  }

  // Low budget confidence
  if (fileTypeDetection && fileTypeDetection.budgetConfidence < 0.3 && fileTypeDetection.likelyFileType === 'budget') {
    suggestions.push(
      `⚠️ Low confidence this is a budget file (${Math.round(fileTypeDetection.budgetConfidence * 100)}%). Please verify the file contains budget data.`
    );
  }

  // Missing required fields
  if (missingFields.length > 0) {
    suggestions.push(
      `Missing required fields: ${missingFields.join(', ')}. Please map these manually from: ${unmappedColumns.join(', ')}`
    );
  }

  // Low confidence mappings
  const lowConfidenceMappings = mappings.filter(m => m.confidence < 0.7);
  if (lowConfidenceMappings.length > 0) {
    suggestions.push(
      `Low confidence mappings detected for: ${lowConfidenceMappings.map(m => m.sourceColumn).join(', ')}. Please verify these are correct.`
    );
  }

  // Multiple currency columns
  const currencyMappings = mappings.filter(m => m.targetField === 'currency');
  if (currencyMappings.length === 0 && mappings.some(m => m.targetField === 'budgetedAmount')) {
    suggestions.push(
      `No currency column detected. Currency will default to USD. Add a currency column if needed.`
    );
  }

  return suggestions;
}

/**
 * Validate mapped data before import
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    row: number;
    column: string;
    value: any;
    error: string;
  }>;
  warnings: Array<{
    row: number;
    column: string;
    value: any;
    warning: string;
  }>;
}

export function validateMappedData(
  rows: any[][],
  mappings: ColumnMapping[]
): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // Create mapping index
  const fieldIndexes: Record<string, number> = {};
  mappings.forEach(mapping => {
    const colIndex = rows[0].indexOf(mapping.sourceColumn);
    if (colIndex !== -1) {
      fieldIndexes[mapping.targetField] = colIndex;
    }
  });

  // Validate each row (skip header row)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Check required fields
    for (const requiredField of REQUIRED_FIELDS) {
      const colIndex = fieldIndexes[requiredField];
      if (colIndex === undefined || !row[colIndex]) {
        errors.push({
          row: i + 1,
          column: requiredField,
          value: row[colIndex],
          error: `Required field "${requiredField}" is missing`,
        });
      }
    }

    // Validate budgetedAmount is numeric
    if (fieldIndexes.budgetedAmount !== undefined) {
      const amount = row[fieldIndexes.budgetedAmount];
      const numericAmount = parseFloat(String(amount).replace(/[,$]/g, ''));
      if (isNaN(numericAmount) || numericAmount <= 0) {
        errors.push({
          row: i + 1,
          column: 'budgetedAmount',
          value: amount,
          error: 'Budget amount must be a positive number',
        });
      }
    }

    // Validate fiscalPeriod format
    if (fieldIndexes.fiscalPeriod !== undefined) {
      const period = row[fieldIndexes.fiscalPeriod];
      if (!VALUE_PATTERNS.fiscalPeriod.test(String(period))) {
        warnings.push({
          row: i + 1,
          column: 'fiscalPeriod',
          value: period,
          warning: 'Fiscal period format may be incorrect (expected FY2025, Q1-2025, etc.)',
        });
      }
    }

    // Validate currency if present
    if (fieldIndexes.currency !== undefined) {
      const currency = row[fieldIndexes.currency];
      if (currency && !VALUE_PATTERNS.currency.test(String(currency))) {
        warnings.push({
          row: i + 1,
          column: 'currency',
          value: currency,
          warning: 'Currency code may be incorrect (expected USD, GBP, EUR, etc.)',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Transform mapped data to budget objects
 */
export function transformMappedData(
  rows: any[][],
  mappings: ColumnMapping[]
): Array<{
  department: string;
  subCategory?: string;
  fiscalPeriod: string;
  budgetedAmount: number;
  currency: string;
}> {
  const results: any[] = [];

  // Create mapping index
  const fieldIndexes: Record<string, number> = {};
  mappings.forEach(mapping => {
    const colIndex = rows[0].indexOf(mapping.sourceColumn);
    if (colIndex !== -1) {
      fieldIndexes[mapping.targetField] = colIndex;
    }
  });

  // Transform each row (skip header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Skip empty rows
    if (row.every(cell => !cell)) continue;

    const budget: any = {
      department: row[fieldIndexes.department],
      fiscalPeriod: row[fieldIndexes.fiscalPeriod],
      budgetedAmount: parseFloat(
        String(row[fieldIndexes.budgetedAmount]).replace(/[,$]/g, '')
      ),
      currency: fieldIndexes.currency !== undefined
        ? row[fieldIndexes.currency]
        : 'USD',
    };

    if (fieldIndexes.subCategory !== undefined && row[fieldIndexes.subCategory]) {
      budget.subCategory = row[fieldIndexes.subCategory];
    }

    results.push(budget);
  }

  return results;
}
