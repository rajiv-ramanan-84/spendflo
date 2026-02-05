/**
 * Enhanced AI Fuzzy Mapping Engine
 *
 * Production-grade column mapping with:
 * - Fuzzy string matching (Levenshtein distance)
 * - Context-aware detection
 * - Confidence scoring with explainability
 * - Typo detection and suggestions
 * - Multi-language support foundations
 *
 * Architecture principles:
 * - Enterprise-grade: Fault-tolerant, observable, testable
 * - FinTech PM: Clear explanations, user trust, transparency
 * - Google Engineering: Performance, scalability, monitoring
 */

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number; // 0.0 - 1.0
  reason: string;
  sampleValues?: any[];
  suggestions?: string[]; // Alternative mappings if confidence is low
  typoDetected?: boolean;
  suggestedCorrection?: string;
}

export interface MappingResult {
  mappings: ColumnMapping[];
  unmappedColumns: string[];
  requiredFieldsMissing: string[];
  suggestions: string[];
  confidence: {
    overall: number; // Average confidence across all mappings
    byField: Record<string, number>;
  };
}

// Required and optional fields
const REQUIRED_FIELDS = ['department', 'fiscalPeriod', 'budgetedAmount'];
const OPTIONAL_FIELDS = ['subCategory', 'currency'];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

/**
 * Enhanced field patterns with variations
 */
const FIELD_PATTERNS: Record<string, string[]> = {
  department: [
    'department', 'dept', 'dpt', 'division', 'div', 'team',
    'business unit', 'bu', 'organization', 'org', 'org unit',
    'cost center', 'cc', 'organizational unit', 'unit',
    // Anaplan/Prophix specific
    'cost centre', 'organizational structure', 'hierarchy'
  ],
  subCategory: [
    'subcategory', 'sub-category', 'sub category', 'subcat',
    'budget category', 'expense category', 'expense type',
    'category', 'cat', 'type', 'account', 'gl account',
    'what we\'re spending on', 'spending on', 'expense',
    'sub type', 'subtype', 'budget type', 'spend category',
    // FP&A platform specific
    'account name', 'expense account', 'line item'
  ],
  fiscalPeriod: [
    'fiscal period', 'time period', 'period', 'when',
    'fiscal year', 'fy', 'quarter', 'q', 'year', 'fiscal',
    'time', 'date', 'reporting period', 'budget period',
    // Variations
    'fiscal yr', 'f/y', 'fiscal quarter', 'fiscal qtr',
    'budget year', 'planning period'
  ],
  budgetedAmount: [
    'budgeted amount', 'budget', 'amount', 'how much', 'total',
    'allocated', 'allocation', 'value', 'plan amount',
    'budget amt', 'budget amount', 'planned amount',
    'planned budget', 'budgeted', 'budget value',
    // FP&A platform specific
    'plan', 'target', 'forecast', 'budget_amount'
  ],
  currency: [
    'currency', 'curr', 'ccy', 'money type', 'currency code',
    'currency type', 'denomination', 'curr code',
    // Variations
    'iso currency', 'currency_code'
  ]
};

/**
 * Value patterns for validation (regex)
 */
const VALUE_PATTERNS: Record<string, RegExp> = {
  department: /^(engineering|eng|sales|marketing|mkt|finance|fin|hr|human|operations|ops|it|legal|customer|product|admin)/i,
  fiscalPeriod: /^(FY|Q[1-4]|20\d{2}|fy|q[1-4]|\d{4})/i,
  budgetedAmount: /^[\$£€]?\s*\d+[\d,.]*/,
  currency: /^(USD|GBP|EUR|JPY|CAD|AUD|CHF|CNY|INR)$/i
};

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 * Used for fuzzy matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two strings (0.0 - 1.0)
 */
function similarityScore(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return maxLength === 0 ? 1.0 : 1.0 - (distance / maxLength);
}

/**
 * Enhanced fuzzy match with Levenshtein distance
 */
function fuzzyMatch(input: string, patterns: string[]): {
  matched: boolean;
  bestMatch?: string;
  confidence: number;
} {
  const inputLower = input.toLowerCase().trim();

  // Exact match
  for (const pattern of patterns) {
    if (inputLower === pattern.toLowerCase()) {
      return { matched: true, bestMatch: pattern, confidence: 1.0 };
    }
  }

  // Substring match
  for (const pattern of patterns) {
    if (inputLower.includes(pattern.toLowerCase()) || pattern.toLowerCase().includes(inputLower)) {
      return { matched: true, bestMatch: pattern, confidence: 0.9 };
    }
  }

  // Fuzzy match with Levenshtein distance
  let bestScore = 0;
  let bestPattern = '';

  for (const pattern of patterns) {
    const score = similarityScore(input, pattern);
    if (score > bestScore) {
      bestScore = score;
      bestPattern = pattern;
    }
  }

  // Threshold for fuzzy match
  if (bestScore >= 0.75) {
    return { matched: true, bestMatch: bestPattern, confidence: bestScore };
  }

  return { matched: false, confidence: 0 };
}

/**
 * Detect typos in known entity values (departments, currencies, etc.)
 */
function detectTypos(value: string, knownValues: string[]): {
  hasTypo: boolean;
  suggestion?: string;
  confidence: number;
} {
  const valueLower = value.toLowerCase().trim();

  // Check for exact match first
  for (const known of knownValues) {
    if (valueLower === known.toLowerCase()) {
      return { hasTypo: false, confidence: 1.0 };
    }
  }

  // Check for typos using Levenshtein distance
  let bestScore = 0;
  let bestMatch = '';

  for (const known of knownValues) {
    const score = similarityScore(value, known);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = known;
    }
  }

  // If very similar (>0.8), likely a typo
  if (bestScore >= 0.8) {
    return {
      hasTypo: true,
      suggestion: bestMatch,
      confidence: bestScore
    };
  }

  return { hasTypo: false, confidence: 0 };
}

/**
 * Detect field type from column header and sample values
 * Enhanced with fuzzy logic and confidence scoring
 */
function detectFieldType(
  header: string,
  sampleValues: any[],
  knownDepartments?: string[]
): ColumnMapping | null {
  type Match = {
    field: string;
    confidence: number;
    reason: string;
    patternMatched: string;
    typoDetected?: boolean;
    suggestedCorrection?: string;
  };

  const matches: Match[] = [];

  // Check each target field
  for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
    const fuzzyResult = fuzzyMatch(header, patterns);

    if (fuzzyResult.matched) {
      let confidence = fuzzyResult.confidence * 0.6; // Header match base score
      let reason = `Header "${header}" matches pattern "${fuzzyResult.bestMatch}"`;

      // Validate with sample values
      if (sampleValues.length > 0 && VALUE_PATTERNS[field]) {
        const pattern = VALUE_PATTERNS[field];
        const matchCount = sampleValues.filter(val => {
          if (!val) return false;
          return pattern.test(String(val));
        }).length;
        const matchRate = matchCount / sampleValues.length;

        if (matchRate > 0.5) {
          confidence += matchRate * 0.4; // Value match adds to confidence
          reason += ` and ${Math.round(matchRate * 100)}% of values match pattern`;
        }
      }

      // Special handling for departments - check for typos
      let typoDetected = false;
      let suggestedCorrection = undefined;

      if (field === 'department' && knownDepartments && sampleValues.length > 0) {
        const firstValue = String(sampleValues[0] || '');
        const typoCheck = detectTypos(firstValue, knownDepartments);
        if (typoCheck.hasTypo) {
          typoDetected = true;
          suggestedCorrection = typoCheck.suggestion;
          confidence = Math.min(confidence, 0.7); // Lower confidence if typo detected
        }
      }

      matches.push({
        field,
        confidence: Math.min(confidence, 1.0),
        reason,
        patternMatched: fuzzyResult.bestMatch!,
        typoDetected,
        suggestedCorrection
      });
    }
  }

  // No matches found
  if (matches.length === 0) {
    return null;
  }

  // Sort by confidence (desc), then by pattern specificity
  matches.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) > 0.05) {
      return b.confidence - a.confidence;
    }
    return b.patternMatched.length - a.patternMatched.length;
  });

  // Return best match
  const best = matches[0];

  // Generate alternative suggestions if confidence is not high
  const suggestions = matches
    .slice(1, 4)
    .filter(m => m.confidence > 0.4)
    .map(m => m.field);

  return {
    sourceColumn: header,
    targetField: best.field,
    confidence: best.confidence,
    reason: best.reason,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    typoDetected: best.typoDetected,
    suggestedCorrection: best.suggestedCorrection
  };
}

/**
 * Main function: Suggest mappings for a dataset
 * Enhanced with comprehensive analysis
 */
export function suggestMappingsEnhanced(
  headers: string[],
  sampleRows: any[][],
  options?: {
    knownDepartments?: string[];
    knownCurrencies?: string[];
    strictMode?: boolean; // Require higher confidence thresholds
  }
): MappingResult {
  const mappings: ColumnMapping[] = [];
  const unmappedColumns: string[] = [];
  const usedFields = new Set<string>();

  // Analyze each column
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const sampleValues = sampleRows.map(row => row[i]).filter(val => val !== null && val !== undefined);

    const mapping = detectFieldType(header, sampleValues, options?.knownDepartments);

    if (mapping && !usedFields.has(mapping.targetField)) {
      // In strict mode, require higher confidence
      if (options?.strictMode && mapping.confidence < 0.7) {
        unmappedColumns.push(header);
        continue;
      }

      mappings.push({
        ...mapping,
        sampleValues: sampleValues.slice(0, 3) // First 3 samples for preview
      });
      usedFields.add(mapping.targetField);
    } else {
      unmappedColumns.push(header);
    }
  }

  // Check for missing required fields
  const mappedFields = new Set(mappings.map(m => m.targetField));
  const requiredFieldsMissing = REQUIRED_FIELDS.filter(
    field => !mappedFields.has(field)
  );

  // Calculate overall confidence
  const overallConfidence = mappings.length > 0
    ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
    : 0;

  const confidenceByField: Record<string, number> = {};
  mappings.forEach(m => {
    confidenceByField[m.targetField] = m.confidence;
  });

  // Generate suggestions
  const suggestions = generateSuggestions(
    mappings,
    requiredFieldsMissing,
    unmappedColumns
  );

  return {
    mappings,
    overallConfidence, // Top-level for easy access
    unmappedColumns,
    requiredFieldsMissing,
    suggestions,
    confidence: {
      overall: overallConfidence,
      byField: confidenceByField
    }
  };
}

/**
 * Generate helpful suggestions for the user
 */
function generateSuggestions(
  mappings: ColumnMapping[],
  missingFields: string[],
  unmappedColumns: string[]
): string[] {
  const suggestions: string[] = [];

  // Missing required fields
  if (missingFields.length > 0) {
    suggestions.push(
      `⚠️  Missing required fields: ${missingFields.join(', ')}. Please map these manually.`
    );

    if (unmappedColumns.length > 0) {
      suggestions.push(
        `💡 Unmapped columns available: ${unmappedColumns.join(', ')}. Check if any of these contain the missing fields.`
      );
    }
  }

  // Low confidence mappings
  const lowConfidenceMappings = mappings.filter(m => m.confidence < 0.7);
  if (lowConfidenceMappings.length > 0) {
    suggestions.push(
      `⚠️  Low confidence detected for: ${lowConfidenceMappings.map(m => m.sourceColumn).join(', ')}. Please review these mappings.`
    );
  }

  // Typos detected
  const typoMappings = mappings.filter(m => m.typoDetected);
  if (typoMappings.length > 0) {
    typoMappings.forEach(m => {
      suggestions.push(
        `🔤 Possible typo in "${m.sourceColumn}" values. Did you mean "${m.suggestedCorrection}"?`
      );
    });
  }

  // Currency handling
  const currencyMappings = mappings.filter(m => m.targetField === 'currency');
  if (currencyMappings.length === 0 && mappings.some(m => m.targetField === 'budgetedAmount')) {
    suggestions.push(
      `ℹ️  No currency column detected. Currency will default to USD.`
    );
  }

  // Sub-category handling
  const subCatMappings = mappings.filter(m => m.targetField === 'subCategory');
  if (subCatMappings.length === 0) {
    suggestions.push(
      `ℹ️  No sub-category column detected. Budgets will be tracked at department level only.`
    );
  }

  // Overall confidence
  const avgConfidence = mappings.length > 0
    ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
    : 0;

  if (avgConfidence >= 0.9) {
    suggestions.push(
      `✅ High confidence mappings (${Math.round(avgConfidence * 100)}%). Ready to proceed!`
    );
  } else if (avgConfidence >= 0.7) {
    suggestions.push(
      `⚠️  Medium confidence mappings (${Math.round(avgConfidence * 100)}%). Review recommended before proceeding.`
    );
  } else {
    suggestions.push(
      `❌ Low confidence mappings (${Math.round(avgConfidence * 100)}%). Manual review required.`
    );
  }

  return suggestions;
}

/**
 * Backwards compatibility: Wrapper for existing suggestMappings function
 */
export function suggestMappings(
  headers: string[],
  sampleRows: any[][]
): MappingResult {
  return suggestMappingsEnhanced(headers, sampleRows);
}
