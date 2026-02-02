# SpendFlo Budget Module - Complete Redesign

## Design System (from Figma PDF)
- Primary Color: Pink/Magenta (#E91E63)
- Logo: Pink triangle/mountain icon  
- Clean white background
- Modern, minimal UI
- Rounded buttons and pills

## New User Flow

### Homepage (/)
- 2 large role-based tiles:
  1. FP&A User → Upload Budgets (Excel)
  2. Business User → Create Request (Smart Form)
- Pink gradient design
- Modern card-based layout

### FP&A Flow (/fpa/upload)
- Drag-and-drop Excel upload
- Auto-parse budget data
- Preview before import
- Bulk import with validation

### Business Flow (/business/request)
- Intelligent form with AI autofill
- Minimal fields (supplier, amount, description)
- AI suggests:
  - Budget category (e.g., "Salesforce" → "Software")
  - Sub-category
  - Department
- Real-time budget validation
- Show available budget

### Status Tracking (/business/status)
- List of submitted requests
- Status badges (Pending, Approved, Rejected)
- Timeline view

## Files to Create
1. app/page.tsx - New homepage with tiles
2. app/fpa/upload/page.tsx - Excel upload
3. app/business/request/page.tsx - Smart form
4. app/business/status/page.tsx - Request tracking
5. app/api/upload-budget/route.ts - Excel parser
6. app/api/suggest-category/route.ts - AI suggestions
7. sample-budget-template.xlsx - Excel template

