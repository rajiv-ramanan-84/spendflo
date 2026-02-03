// Quick debug script to test detectFieldType function
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
  ],
  subCategory: [
    'subcategory',
    'sub-category',
    'sub category',
    'budget category',
    'category',
    'type',
    'sub type',
    'subtype',
  ],
  fiscalPeriod: [
    'fiscal period',
    'period',
    'fiscal year',
    'fy',
    'quarter',
    'q',
    'year',
    'fiscal',
  ],
  budgetedAmount: [
    'budget',
    'budgeted amount',
    'amount',
    'total',
    'allocated',
    'allocation',
    'value',
  ],
  currency: [
    'currency',
    'curr',
    'ccy',
  ],
};

const VALUE_PATTERNS = {
  department: /^(engineering|sales|marketing|finance|hr|operations|it|legal|admin)/i,
  fiscalPeriod: /^(FY|Q\d|20\d{2}|fy|q\d)/i,
  budgetedAmount: /^[\$£€]?\s*\d+[,.]?\d*/,
  currency: /^(USD|GBP|EUR|JPY|CAD|AUD)$/i,
};

function detectFieldType(
  header: string,
  sampleValues: string[]
): { targetField: string; confidence: number; reason: string } | null {
  const headerLower = header.toLowerCase().trim();

  // Check each target field
  for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
    let confidence = 0;
    let reason = '';

    // Check header match
    for (const pattern of patterns) {
      if (headerLower.includes(pattern.toLowerCase())) {
        confidence += 0.5;
        reason = `Header "${header}" matches pattern "${pattern}"`;
        break;
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

    // Return if confidence is high enough
    if (confidence >= 0.5) {
      return {
        targetField: field,
        confidence: Math.min(confidence, 1.0),
        reason,
      };
    }
  }

  return null;
}

// Test with "Budget Category"
const header = "Budget Category";
const sampleValues = ["Software", "Hardware", "Travel", "Advertising", "Software"];

console.log(`Testing header: "${header}"`);
console.log(`Sample values: ${sampleValues.join(', ')}`);
console.log('');

const result = detectFieldType(header, sampleValues);

if (result) {
  console.log(`✅ Detected mapping:`);
  console.log(`   Target field: ${result.targetField}`);
  console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`   Reason: ${result.reason}`);
} else {
  console.log(`❌ No mapping detected`);
}
