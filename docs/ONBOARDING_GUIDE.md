# Budget Sync Onboarding Guide

**For SpendFlo Onboarding Team**

This guide walks you through onboarding a customer who wants to sync their budgets from an external FP&A tool to SpendFlo.

---

## Overview

Budget sync allows customers to maintain their budgets in their existing FP&A tool (Anaplan, Prophix, Google Sheets, etc.) and automatically sync them to SpendFlo every 4 hours (configurable).

**Key Benefits:**
- ✅ Customer keeps using their preferred FP&A tool (no change management)
- ✅ SpendFlo always has latest budget data
- ✅ AI automatically maps column names (no manual configuration)
- ✅ Works offline (budget checks don't depend on external API)

---

## Onboarding Checklist

### **Step 1: Discover Customer's FP&A Tool** (5 min)

Ask the customer: **"Which tool do you use to manage budgets?"**

Common answers:
- **Google Sheets** → Go to Section 2.1
- **Anaplan** → Go to Section 2.2
- **Prophix** → Go to Section 2.3
- **Workday Adaptive Planning** → Go to Section 2.4
- **Oracle EPM / Hyperion** → Go to Section 2.5
- **SAP BPC** → Go to Section 2.6
- **Excel (manual process)** → Go to Section 2.7
- **Other** → Go to Section 2.8

### **Step 2: Choose Integration Method**

Based on customer's tool, choose:

| FP&A Tool | Recommended Method | Setup Time |
|-----------|-------------------|------------|
| Google Sheets | SFTP or API | 15 min |
| Anaplan | SFTP | 1-2 hours |
| Prophix | SFTP | 1-2 hours |
| Workday Adaptive | SFTP or S3 | 1-2 hours |
| Oracle EPM | SFTP | 2-3 hours |
| SAP BPC | SFTP | 2-3 hours |
| Excel (manual) | Direct Upload | 10 min |

### **Step 3: Provide Setup Instructions**

Send customer IT team the appropriate guide:
- [SFTP Setup Guide](./SFTP_SETUP_GUIDE.md) - For most enterprise tools
- [S3 Setup Guide](./S3_SETUP_GUIDE.md) - For cloud-native customers
- [Tool-Specific Guides](./FPA_TOOL_GUIDES/) - Detailed instructions per tool

### **Step 4: Configure in SpendFlo**

Once customer IT team has set up the export:

1. **Log in to SpendFlo Admin**
2. Go to **Settings → Budget Sync**
3. Click **"Add New Sync Source"**
4. Fill in the form:
   - **Customer ID**: (auto-filled)
   - **Source Type**: Select from dropdown (SFTP, S3, Google Sheets, etc.)
   - **Sync Frequency**: Default is "Every 4 Hours" (recommended)
   - **Source Configuration**: Enter connection details

5. **Test Connection**: Click "Test Connection" to verify SpendFlo can access the file
6. **Run First Sync**: Click "Sync Now" to perform initial import

### **Step 5: Verify & Validate**

After first sync completes:

1. **Check Sync Status**:
   - Go to **Settings → Budget Sync → History**
   - Verify status shows "Success" (green)
   - Check stats: Created, Updated, Errors

2. **Review Budget Data**:
   - Go to **Budgets** page
   - Verify budgets imported correctly
   - Check departments, amounts, fiscal periods

3. **Test Budget Check**:
   - Create a test purchase request
   - Verify it checks budget correctly

### **Step 6: Schedule & Monitor**

1. **Confirm Schedule**:
   - Default: Every 4 hours
   - Customer can change to hourly, daily, or manual

2. **Set Up Alerts** (optional):
   - Configure email notifications for sync failures
   - Set up Slack webhook for status updates

3. **Provide Customer Dashboard**:
   - Share link to sync status page
   - Show them "Refresh Now" button for manual sync

---

## Section 2: Tool-Specific Instructions

### 2.1 Google Sheets

**Option A: SFTP Export (Recommended)**
1. Customer creates a scheduled Google Apps Script that exports sheet to CSV
2. Script uploads CSV to SpendFlo SFTP server
3. SpendFlo polls every 4 hours for new files

**Option B: API Access**
1. Customer grants SpendFlo read access to their Google Sheet
2. SpendFlo fetches data via Google Sheets API
3. No file export needed

**Setup Time**: 15-30 minutes

**Credentials Needed**:
- SFTP: SpendFlo provides credentials
- API: Customer creates service account, shares sheet

### 2.2 Anaplan

**File Export Method** (only option for Anaplan):

1. **Customer IT Team Actions**:
   - Create export action in Anaplan (Export → Budget CSV)
   - Schedule export to run daily (2 AM local time)
   - Configure Anaplan Connect to pick up file
   - Anaplan Connect uploads to SpendFlo SFTP

2. **Required Anaplan Permissions**:
   - Workspace Administrator (to create exports)
   - Model Builder (to schedule actions)

3. **Anaplan Connect Setup**:
   - Install Anaplan Connect on customer's server
   - Configure with customer's Anaplan credentials
   - Set up SFTP destination (SpendFlo provides)

**Setup Time**: 1-2 hours (requires IT team)

**Complexity**: Medium-High (requires Anaplan Connect)

### 2.3 Prophix

**File Export Method**:

1. **Customer IT Team Actions**:
   - Create budget cube export in Prophix
   - Schedule export via Prophix Automation (daily 2 AM)
   - Configure output destination (SFTP or S3)

2. **Export Format**:
   - CSV or Excel format
   - Include columns: Department, Account, Period, Amount, Currency

3. **Automation Setup**:
   - Use Prophix Automation to trigger export
   - Configure SFTP connection in Prophix

**Setup Time**: 1-2 hours

**Complexity**: Medium

### 2.4 Workday Adaptive Planning

**Option A: Report Export (Recommended)**

1. Create custom report with budget data
2. Schedule report to run daily
3. Export to SFTP or S3

**Option B: API Integration**

1. Use Workday Adaptive API
2. Requires Workday API credentials
3. SpendFlo calls API to fetch budgets

**Setup Time**: 1-2 hours

**Complexity**: Medium

### 2.5 Oracle EPM / Hyperion

**SmartView Export Method**:

1. Customer creates SmartView report
2. Schedule EPM Automate to export report
3. Configure output destination (SFTP)

**Setup Time**: 2-3 hours (requires EPM admin)

**Complexity**: High

### 2.6 SAP BPC

**BW Query Export**:

1. Create BW query for budget data
2. Schedule background job to export query
3. Configure file transfer to SFTP

**Setup Time**: 2-3 hours (requires SAP admin)

**Complexity**: High

### 2.7 Excel (Manual Process)

**Option A: Manual Upload**
1. Customer exports Excel to CSV monthly
2. Uploads file to SpendFlo UI
3. SpendFlo AI maps columns automatically

**Option B: SFTP Drop**
1. Customer saves Excel to network drive
2. Scheduled script converts to CSV and uploads to SFTP

**Setup Time**: 10-30 minutes

**Complexity**: Low

### 2.8 Other Tools

For unlisted tools:
1. **Check if tool supports scheduled exports** (most do)
2. **Export format**: CSV or Excel
3. **Delivery method**: SFTP or S3
4. **Schedule**: Daily at 2 AM (recommended)

Contact SpendFlo engineering if customer's tool is not supported.

---

## Section 3: Common Issues & Troubleshooting

### Issue: "Test Connection Failed"

**Possible Causes**:
- Incorrect SFTP credentials
- Firewall blocking SpendFlo IP
- Wrong file path

**Resolution**:
1. Verify credentials are correct
2. Ask customer IT to whitelist SpendFlo IPs: `54.x.x.x, 52.x.x.x` (provide actual IPs)
3. Check file path has correct permissions

### Issue: "Sync Completed with Errors"

**Possible Causes**:
- Missing required columns (Department, Amount, Period)
- Invalid data (negative amounts, blank departments)
- Incorrect date formats

**Resolution**:
1. Go to Sync History → View Errors
2. Download error report (shows which rows failed)
3. Share with customer to fix data
4. Re-run sync

### Issue: "Low Confidence Warning"

**What it means**: AI mapper detected columns but confidence is <75%

**Resolution**:
1. Review suggested mappings
2. Manually confirm correct columns
3. Save mapping for future syncs

### Issue: "No New Files Found"

**Possible Causes**:
- Customer's export hasn't run yet
- File is in wrong directory
- File naming pattern changed

**Resolution**:
1. Check customer's export schedule
2. Verify file appears in SFTP directory
3. Check file name matches expected pattern

---

## Section 4: FAQs

**Q: How often does sync run?**
A: Default is every 4 hours. Customer can configure hourly, daily, or manual.

**Q: What happens if customer changes column names?**
A: AI mapper will detect new columns automatically. May prompt for confirmation if confidence is low.

**Q: Can customer sync multiple FP&A tools?**
A: Yes! Each tool gets its own sync configuration.

**Q: What if customer's tool doesn't support automated exports?**
A: Use manual upload option. Customer uploads CSV monthly via SpendFlo UI.

**Q: Does sync overwrite existing budgets?**
A: Yes. External system is source of truth. SpendFlo preserves utilization data (committed/reserved amounts).

**Q: What if budget disappears from customer's system?**
A: SpendFlo soft-deletes it (marks as deleted but preserves data for audit).

---

## Section 5: Next Steps After Onboarding

1. **Schedule Follow-Up** (1 week):
   - Verify syncs running smoothly
   - Check for any errors
   - Answer customer questions

2. **Provide Training**:
   - Show customer how to monitor sync status
   - Demonstrate manual "Refresh Now" button
   - Explain how to view sync history

3. **Set Expectations**:
   - Data is 0-4 hours old (depending on sync frequency)
   - Budget checks always work (even if sync fails)
   - Customer should notify SpendFlo if they change FP&A tool

---

## Contact for Support

- **Technical Issues**: engineering@spendflo.com
- **Onboarding Questions**: success@spendflo.com
- **Slack**: #budget-sync-support
