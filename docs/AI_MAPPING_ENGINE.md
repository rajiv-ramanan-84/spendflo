# AI-Powered Column Mapping Engine

## Overview

The AI-powered column mapping engine intelligently maps spreadsheet columns to budget fields using pattern matching and heuristics. This eliminates manual mapping work and reduces errors during budget imports.

## Features

- **Intelligent Pattern Matching**: Uses header names and sample data to detect field types
- **Confidence Scoring**: Each mapping includes a confidence score (0-1) to indicate reliability
- **Value Pattern Validation**: Analyzes sample values to confirm mappings
- **Best-Match Strategy**: Prioritizes longer, more specific pattern matches
- **Required Field Detection**: Identifies missing required fields before import
- **Suggestions Engine**: Provides helpful guidance for low-confidence mappings

## Supported Field Types

### Required Fields
- `department`: Department or business unit (e.g., Engineering, Sales, Marketing)
- `fiscalPeriod`: Fiscal period or year (e.g., FY2025, Q1-2025, 2025)
- `budgetedAmount`: Budget amount (numeric value)

### Optional Fields
- `subCategory`: Budget sub-category or type (e.g., Software, Hardware, Travel)
- `currency`: Currency code (e.g., USD, GBP, EUR)

## Pattern Matching

### Header Patterns

The engine recognizes various column naming conventions:

#### Department
- department, dept, division, team, business unit, bu, organization, org

#### Sub-Category
- subcategory, sub-category, sub category, budget category, category, type, sub type, subtype

#### Fiscal Period
- fiscal period, period, fiscal year, fy, quarter, q, year, fiscal

#### Budgeted Amount
- budget, budgeted amount, amount, total, allocated, allocation, value

#### Currency
- currency, curr, ccy

### Value Patterns

The engine also validates mappings by analyzing sample data:

- **Department**: Matches common department names (Engineering, Sales, Marketing, Finance, HR, Operations, IT, Legal, Admin)
- **Fiscal Period**: Matches formats like FY2025, Q1, Q2-2025, 2025
- **Budgeted Amount**: Matches numeric values with optional currency symbols ($, £, €)
- **Currency**: Matches standard currency codes (USD, GBP, EUR, JPY, CAD, AUD)

## Confidence Scoring

Confidence scores are calculated based on:

1. **Header Match** (50%): Column name matches known patterns
2. **Value Match** (up to 50%): Sample values match expected patterns
3. **Pattern Length**: Longer pattern matches are preferred (e.g., "budget category" over "bu")

## API Endpoints

### 1. AI Mapping Suggestion

**Endpoint**: `POST /api/imports/ai-map`

Analyzes a CSV/Excel file and returns mapping suggestions.

**Request**:
```bash
curl -X POST http://localhost:3001/api/imports/ai-map \
  -F "file=@budget-data.csv"
```

**Response**:
```json
{
  "success": true,
  "file": {
    "name": "budget-data.csv",
    "size": 1234,
    "type": "csv",
    "totalRows": 50,
    "totalColumns": 5
  },
  "mappings": [
    {
      "sourceColumn": "Department",
      "targetField": "department",
      "confidence": 1.0,
      "reason": "Header \"Department\" matches pattern \"department\" and values match pattern",
      "sampleValues": ["Engineering", "Sales", "Marketing"]
    }
  ],
  "unmappedColumns": [],
  "requiredFieldsMissing": [],
  "suggestions": [],
  "canProceed": true
}
```

### 2. Execute Import

**Endpoint**: `POST /api/imports/execute`

Executes the import with confirmed mappings.

**Request**:
```bash
curl -X POST http://localhost:3001/api/imports/execute \
  -F "file=@budget-data.csv" \
  -F 'mappings=[{"sourceColumn":"Department","targetField":"department"}...]' \
  -F "customerId=cust_123" \
  -F "createdById=user_123"
```

**Response**:
```json
{
  "success": true,
  "importId": "import_123",
  "totalRows": 50,
  "successCount": 48,
  "errorCount": 2,
  "errors": [
    {
      "row": 15,
      "error": "Budget amount must be a positive number"
    }
  ],
  "warnings": [
    {
      "row": 20,
      "column": "fiscalPeriod",
      "value": "2025",
      "warning": "Fiscal period format may be incorrect"
    }
  ]
}
```

### 3. Import History

**Endpoint**: `GET /api/imports/history?customerId=cust_123`

Retrieves import history for a customer.

**Response**:
```json
{
  "success": true,
  "imports": [
    {
      "id": "import_123",
      "fileName": "budget-data.csv",
      "fileSize": 1234,
      "totalRows": 50,
      "successCount": 48,
      "errorCount": 2,
      "status": "completed",
      "createdAt": "2025-01-15T10:30:00Z",
      "completedAt": "2025-01-15T10:30:05Z",
      "importedBy": {
        "id": "user_123",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ],
  "pagination": {
    "total": 10,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

## Import Flow

### Step 1: Upload & Analyze
1. User uploads CSV/Excel file
2. System parses file to extract headers and sample rows
3. AI mapping engine analyzes data and suggests mappings
4. System returns suggestions with confidence scores

### Step 2: Review & Confirm
1. User reviews suggested mappings
2. User can manually adjust mappings if needed
3. System shows missing required fields if any
4. User confirms mappings

### Step 3: Validate & Import
1. System validates all data rows
2. System checks for:
   - Missing required fields
   - Invalid numeric values
   - Incorrect fiscal period formats
   - Invalid currency codes
3. System creates import history record
4. System imports data in transaction (all-or-nothing)
5. System updates or creates budget records
6. System logs all activities

### Step 4: Review Results
1. User sees import summary
2. User can view errors and warnings
3. User can download error report
4. User can retry failed rows

## Data Validation

### Required Field Validation
- All required fields (department, fiscalPeriod, budgetedAmount) must be present
- Values cannot be empty or null

### Budget Amount Validation
- Must be numeric
- Must be greater than 0
- Currency symbols are automatically stripped

### Fiscal Period Validation
- Should match format: FY2025, Q1-2025, 2025
- Warning issued for non-standard formats

### Currency Validation
- Must be standard 3-letter code (USD, GBP, EUR, etc.)
- Defaults to USD if not provided
- Warning issued for unrecognized codes

## Error Handling

### Parse Errors
- Invalid CSV/Excel format
- Corrupted files
- Empty files
- Missing headers

### Validation Errors
- Missing required fields
- Invalid data types
- Out-of-range values
- Duplicate entries

### Import Errors
- Database connection failures
- Transaction rollback on critical errors
- Partial import recovery

## Testing

### Unit Tests
```bash
npx tsx scripts/test-ai-mapping.ts
```

Tests the mapping engine logic with sample data.

### Integration Tests
```bash
npx tsx scripts/test-import-api.sh
```

Tests the full import flow via API endpoints.

## Example CSV Format

```csv
Department,Budget Category,FY,Allocated Amount,Currency Code
Engineering,Software,FY2025,100000,USD
Engineering,Hardware,FY2025,50000,USD
Sales,Travel,FY2025,75000,USD
Marketing,Advertising,FY2025,120000,USD
```

## Example Excel Format

| Department | Budget Category | FY | Allocated Amount | Currency Code |
|------------|-----------------|----|--------------------|--------------|
| Engineering | Software | FY2025 | 100,000 | USD |
| Sales | Travel | FY2025 | 75,000 | USD |

## Performance

- **Small files (< 100 rows)**: < 1 second
- **Medium files (100-1000 rows)**: 1-5 seconds
- **Large files (1000-10000 rows)**: 5-30 seconds

## Limitations

- Maximum file size: 10 MB
- Maximum rows: 10,000
- Supported formats: CSV, XLSX, XLS
- No external AI API required (uses pattern matching heuristics)

## Future Enhancements

1. **Google Sheets Integration**: Direct import from Google Sheets
2. **Custom Field Mapping**: Allow customers to define custom field patterns
3. **Machine Learning**: Use historical mappings to improve suggestions
4. **Bulk Import**: Support importing multiple files at once
5. **Scheduled Imports**: Automatically import from recurring sources
6. **Data Preview**: Show preview of transformed data before import
7. **Rollback**: Allow users to undo imports
