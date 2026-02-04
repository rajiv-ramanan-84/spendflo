# Google Sheets Integration - Product Flow

> **Thinking like a Google PM**: How should the Google Sheets import flow work end-to-end?

## Design Principles

1. **Zero Configuration** - Works out of the box, no manual column mapping
2. **Progressive Disclosure** - Show information step by step, don't overwhelm
3. **Trust & Transparency** - Always show what will happen before it happens
4. **Error Recovery** - Clear error messages with actionable next steps
5. **Speed** - Minimize clicks, maximize defaults

---

## User Flow

### 🎯 **Landing State (Not Connected)**

```
┌─────────────────────────────────────────────┐
│  Google Sheets Import                       │
│  Import budgets directly from Google Sheets │
├─────────────────────────────────────────────┤
│                                             │
│  ⚪ Google Sheets Not Connected             │
│  Connect to access your spreadsheets       │
│                                             │
│  [Connect Google Sheets] (Big CTA)         │
│                                             │
│  ✓ Read-only access                        │
│  ✓ AI-powered column detection             │
│  ✓ Secure OAuth 2.0                        │
└─────────────────────────────────────────────┘
```

**User Action**: Click "Connect Google Sheets"

---

### 🔐 **OAuth Flow**

```
App → Google OAuth Consent Screen

┌─────────────────────────────────────────────┐
│  SpendFlo Budget wants to access            │
│  your Google account                        │
│                                             │
│  This will allow SpendFlo Budget to:       │
│  • View your Google Sheets                 │
│                                             │
│  [Cancel] [Allow]                          │
└─────────────────────────────────────────────┘
```

**User Action**: Click "Allow"

**System**: Redirects back to app with success

---

### ✅ **Connected State**

```
┌─────────────────────────────────────────────┐
│  Google Sheets Import                       │
├─────────────────────────────────────────────┤
│  🟢 Connected as user@gmail.com            │
│  Connected 2 minutes ago                    │
│  [Disconnect]                               │
└─────────────────────────────────────────────┘

Step 1: Select Your Spreadsheet
┌─────────────────────────────────────────────┐
│  🔍 Search spreadsheets...                  │
├─────────────────────────────────────────────┤
│  📊 Q1 2025 Budget Planning                │
│     Modified 2 hours ago                    │
│     [Select]                                │
├─────────────────────────────────────────────┤
│  📊 Annual Budget FY2025                   │
│     Modified yesterday                      │
│     [Select]                                │
├─────────────────────────────────────────────┤
│  📊 Department Budgets                     │
│     Modified last week                      │
│     [Select]                                │
└─────────────────────────────────────────────┘
```

**Key Features**:
- Shows connection status prominently
- Easy disconnect option
- List of spreadsheets with metadata
- Search functionality
- Clear selection CTAs

**User Action**: Click "Select" on a spreadsheet

---

### 📑 **Sheet Selection**

```
Selected: Q1 2025 Budget Planning
┌─────────────────────────────────────────────┐
│  ← Back to spreadsheets                     │
├─────────────────────────────────────────────┤
│  Step 2: Select Sheet to Import             │
│                                             │
│  [📄 Budget Data] ← Sheet 1                │
│  Contains: 24 rows, 8 columns              │
│                                             │
│  [📄 Summary] ← Sheet 2                    │
│  Contains: 5 rows, 3 columns               │
│                                             │
│  [📄 Notes] ← Sheet 3                      │
│  Contains: 10 rows, 2 columns              │
└─────────────────────────────────────────────┘

Preview: First 3 rows from "Budget Data"
┌────────────────────────────────────────────┐
│ Department | Category  | Amount | Period  │
│ Engineering| Software  | 50000  | FY2025  │
│ Sales      | Tools     | 25000  | FY2025  │
│ Marketing  | Ads       | 30000  | FY2025  │
└────────────────────────────────────────────┘

[Continue with "Budget Data"]
```

**Key Features**:
- Back navigation
- Shows all sheets in the spreadsheet
- Row/column count for each sheet
- Preview of first few rows
- Clear indication of which sheet will be used

**User Action**: Click "Continue with [Sheet Name]"

---

### 🤖 **AI Column Mapping (Auto-Detected)**

```
Step 3: Review Column Mapping
┌─────────────────────────────────────────────┐
│  AI detected 24 rows with 5 mapped columns │
│  ✓ All required fields found                │
└─────────────────────────────────────────────┘

Mapped Columns (4 required, 1 optional)
┌─────────────────────────────────────────────┐
│  Department → department ✓ Required         │
│  95% confidence                             │
│  Sample: Engineering, Sales, Marketing      │
├─────────────────────────────────────────────┤
│  Category → subCategory (optional)          │
│  90% confidence                             │
│  Sample: Software, Tools, Advertising       │
├─────────────────────────────────────────────┤
│  Amount → budgetedAmount ✓ Required         │
│  95% confidence                             │
│  Sample: 50000, 25000, 30000               │
├─────────────────────────────────────────────┤
│  Period → fiscalPeriod ✓ Required           │
│  92% confidence                             │
│  Sample: FY2025, Q1 2025                   │
├─────────────────────────────────────────────┤
│  USD → currency ✓ Required                  │
│  100% confidence                            │
│  Sample: USD, USD, USD                      │
└─────────────────────────────────────────────┘

Unmapped Columns (will be ignored)
┌─────────────────────────────────────────────┐
│  • Owner                                    │
│  • Status                                   │
│  • Notes                                    │
└─────────────────────────────────────────────┘

Import Preview
• 24 budgets will be created
• Estimated time: < 5 seconds
• Existing budgets with same department/period will be updated

[← Back] [Import Budgets →]
```

**Key Features**:
- Clear summary at top
- Visual mapping with confidence scores
- Sample data for verification
- Shows unmapped columns (transparency)
- Import preview with expectations
- Clear next steps

**User Action**: Click "Import Budgets"

---

### ⏳ **Importing (Progress)**

```
Importing Budgets...
┌─────────────────────────────────────────────┐
│  ████████████████████░░░░░░░░ 18/24 (75%) │
│                                             │
│  ✓ Engineering budgets imported (8)        │
│  ✓ Sales budgets imported (6)              │
│  ✓ Marketing budgets imported (4)          │
│  ⏳ Processing Finance budgets...           │
└─────────────────────────────────────────────┘
```

**Key Features**:
- Progress bar
- Real-time status updates
- Shows what's being processed
- Can't navigate away (modal overlay)

---

### ✅ **Import Complete**

```
Import Successful! 🎉
┌─────────────────────────────────────────────┐
│  24 budgets imported successfully          │
│  0 errors                                   │
│                                             │
│  Breakdown by Department:                   │
│  • Engineering: 8 budgets                  │
│  • Sales: 6 budgets                        │
│  • Marketing: 5 budgets                    │
│  • Finance: 3 budgets                      │
│  • Operations: 2 budgets                   │
│                                             │
│  [View Dashboard] [Import More]            │
└─────────────────────────────────────────────┘
```

**Key Features**:
- Celebratory tone (emoji, positive language)
- Clear success metrics
- Breakdown of what was imported
- Next action options

---

### ⚠️ **Partial Success (With Errors)**

```
Import Complete with Warnings
┌─────────────────────────────────────────────┐
│  22 budgets imported successfully          │
│  2 rows failed                              │
│                                             │
│  ✅ Successful (22)                         │
│  • Engineering: 8 budgets                  │
│  • Sales: 6 budgets                        │
│  • Marketing: 5 budgets                    │
│  • Finance: 3 budgets                      │
│                                             │
│  ❌ Failed (2)                              │
│  • Row 15: Missing required field "amount" │
│  • Row 23: Invalid fiscal period format   │
│                                             │
│  💡 Fix these rows in Google Sheets and    │
│     import again                            │
│                                             │
│  [View Dashboard] [Fix & Retry]            │
└─────────────────────────────────────────────┘
```

**Key Features**:
- Balanced tone (success + issues)
- Clear separation of success/failure
- Specific error messages with row numbers
- Actionable guidance
- Option to retry

---

### ❌ **Error States**

**Connection Lost**
```
┌─────────────────────────────────────────────┐
│  ⚠️ Connection Lost                         │
│                                             │
│  Your Google Sheets connection expired.    │
│  Please reconnect to continue.             │
│                                             │
│  [Reconnect Google Sheets]                 │
└─────────────────────────────────────────────┘
```

**No Spreadsheets Found**
```
┌─────────────────────────────────────────────┐
│  📄 No Spreadsheets Found                   │
│                                             │
│  We couldn't find any Google Sheets in     │
│  your account.                              │
│                                             │
│  Create a new spreadsheet in Google Sheets │
│  then refresh this page.                    │
│                                             │
│  [Refresh] [Open Google Sheets ↗]          │
└─────────────────────────────────────────────┘
```

**Invalid Data Format**
```
┌─────────────────────────────────────────────┐
│  ⚠️ Cannot Import This Sheet                │
│                                             │
│  Missing required columns:                  │
│  • Department                               │
│  • Budgeted Amount                         │
│  • Fiscal Period                           │
│                                             │
│  Add these columns to your sheet or        │
│  select a different sheet.                 │
│                                             │
│  [← Back to Sheet Selection]               │
│  [View Template Example ↗]                 │
└─────────────────────────────────────────────┘
```

---

## Key Improvements Needed

### 1. **Enhanced Connection Status Card**
- Show connected email
- Show connection time
- Add disconnect button
- Show token expiry warning if needed

### 2. **Spreadsheet List Enhancements**
- Search/filter
- Sort by date modified
- Show owner/permissions
- Pagination for many sheets

### 3. **Sheet Preview**
- Show first 5 rows of data
- Show column headers clearly
- Highlight potential issues

### 4. **Better AI Mapping UI**
- Visual arrows: Source → Target
- Color-coded confidence (green=high, yellow=medium, red=low)
- Editable mappings (dropdown to change target field)
- Warning badges for issues

### 5. **Progress Feedback**
- Real-time progress during import
- Detailed breakdown as it processes
- Cancel option

### 6. **Import Summary Dashboard**
- Visual stats (charts, numbers)
- Audit trail link
- Option to view imported budgets
- Quick import another file CTA

---

## Edge Cases to Handle

1. **Token Expiry During Import**
   - Gracefully handle mid-process expiry
   - Save progress and allow reconnect

2. **Duplicate Budgets**
   - Detect existing budgets
   - Ask user: Update or Skip?

3. **Large Datasets (1000+ rows)**
   - Show warning about processing time
   - Batch processing with progress
   - Consider background job

4. **Network Errors**
   - Retry mechanism
   - Clear error messages
   - Resume capability

5. **Multiple Currencies**
   - Auto-detect and warn
   - Show conversion preview
   - Allow confirmation before import

6. **Invalid Fiscal Periods**
   - Show all unique values found
   - Suggest corrections
   - Allow bulk fix

---

## Mobile Considerations

- Larger touch targets
- Simplified sheet selection (one at a time)
- Bottom sheet for actions
- Swipe to navigate
- Abbreviated column names in mapping view

---

## Accessibility

- Keyboard navigation (Tab, Enter, Escape)
- Screen reader labels
- High contrast mode support
- Focus indicators
- Error announcements

---

## Success Metrics

1. **Connection Success Rate**: % of users who successfully connect Google
2. **Time to First Import**: How fast can a user complete their first import?
3. **Import Success Rate**: % of imports with 0 errors
4. **Mapping Accuracy**: % of columns correctly auto-mapped
5. **Repeat Usage**: % of users who import more than once

---

## Next Steps

1. ✅ Fix connection status refresh (done)
2. 🔲 Add connection info card (email, disconnect button)
3. 🔲 Add spreadsheet search/filter
4. 🔲 Add sheet preview with first 5 rows
5. 🔲 Enhance AI mapping UI (visual arrows, confidence colors)
6. 🔲 Add progress indicator during import
7. 🔲 Improve success/error summary pages
8. 🔲 Add "Fix & Retry" flow for errors
9. 🔲 Add duplicate detection logic
10. 🔲 Performance test with large datasets
