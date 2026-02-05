# FP&A Tool Integration Catalog

**Complete guide to integrating SpendFlo with all major FP&A platforms**

---

## Quick Reference Table

| FP&A Tool | Market Share | Integration Method | Setup Complexity | Time to Implement |
|-----------|-------------|-------------------|------------------|-------------------|
| **Anaplan** | 25% | SFTP (Anaplan Connect) | Medium-High | 1-2 hours |
| **Workday Adaptive** | 20% | SFTP or API | Medium | 1-2 hours |
| **Oracle EPM Cloud** | 15% | SFTP (EPM Automate) | High | 2-3 hours |
| **Prophix** | 10% | SFTP or S3 | Medium | 1-2 hours |
| **IBM Planning Analytics** | 8% | SFTP | Medium-High | 2-3 hours |
| **SAP BPC** | 7% | SFTP (BW Query Export) | High | 2-3 hours |
| **Planful (Host Analytics)** | 5% | SFTP or API | Medium | 1-2 hours |
| **Board International** | 3% | SFTP | Medium | 1-2 hours |
| **OneStream** | 2% | SFTP | Medium | 1-2 hours |
| **Google Sheets** | N/A | SFTP, API, or Manual | Low | 15-30 min |
| **Excel** | N/A | Manual Upload or SFTP | Low | 10-30 min |

---

## 1. Anaplan

**Market Position**: Leading cloud-based EPM platform, popular with F500 companies

**Integration Options**:
1. **Anaplan Connect** (Recommended) - File export via middleware
2. **Anaplan API** - Direct API integration (not recommended - rate limits)

### 1.1 Setup via Anaplan Connect

**Prerequisites**:
- Anaplan Workspace Administrator access
- Server to run Anaplan Connect (Windows/Linux)
- Java 8+ installed

**Steps**:

1. **Create Export Action in Anaplan**:
   ```
   Navigate to: Actions → Export Actions → Create New
   - Name: "SpendFlo Budget Export"
   - Source Module: Your budget module
   - Columns to export:
     * Cost Center (Department)
     * Expense Category (Sub-category)
     * Time (Fiscal Period)
     * Budget Amount
     * Currency
   - Format: CSV
   - Layout: Flat (not hierarchical)
   - Save action
   ```

2. **Schedule Export Process**:
   ```
   Navigate to: Processes → Create New Process
   - Name: "SpendFlo Daily Budget Sync"
   - Add action: "SpendFlo Budget Export"
   - Schedule: Daily at 2:00 AM
   - Save process
   ```

3. **Install Anaplan Connect**:
   ```bash
   # Download from Anaplan Community
   wget https://anaplan.com/downloads/anaplan-connect-latest.zip
   unzip anaplan-connect-latest.zip
   cd anaplan-connect
   ```

4. **Configure Anaplan Connect Script**:
   ```bash
   # Create: spendflo-sync.sh
   #!/bin/bash

   # Anaplan credentials
   ANAPLAN_USER="your-service-account@company.com"
   ANAPLAN_PASS="your-password"
   WORKSPACE_ID="your-workspace-id"
   MODEL_ID="your-model-id"
   EXPORT_ACTION="SpendFlo Budget Export"

   # SpendFlo SFTP credentials
   SFTP_HOST="sftp.spendflo.com"
   SFTP_USER="your-company_budget_sync"
   SFTP_PASS="provided-by-spendflo"

   # Execute Anaplan export
   java -jar anaplan-connect.jar \
     -user "$ANAPLAN_USER" \
     -password "$ANAPLAN_PASS" \
     -workspace "$WORKSPACE_ID" \
     -model "$MODEL_ID" \
     -export "$EXPORT_ACTION" \
     -output /tmp/budget_export.csv

   # Upload to SpendFlo SFTP
   sshpass -p "$SFTP_PASS" sftp $SFTP_USER@$SFTP_HOST <<EOF
   cd /uploads/budgets
   put /tmp/budget_export.csv budget_$(date +%Y%m%d).csv
   bye
   EOF

   echo "[$(date)] Anaplan budget sync completed"
   ```

5. **Schedule with cron**:
   ```bash
   crontab -e
   # Add: 0 3 * * * /path/to/spendflo-sync.sh >> /var/log/anaplan-sync.log 2>&1
   ```

**Expected Export Format**:
```csv
Cost Center,Expense Category,Time,Budget Amount,Currency,Version
Engineering,Software,FY 2025,500000,USD,Budget
Engineering,Hardware,FY 2025,100000,USD,Budget
Sales,Travel,FY 2025,75000,USD,Budget
```

**Common Issues**:
- ❌ Authentication failures → Check Anaplan credentials, may need OAuth
- ❌ Export timing out → Reduce data volume, add filters to export action
- ❌ Version mismatch → SpendFlo uses "Budget" version, filter out "Actual" in export

**Setup Time**: 1-2 hours (requires Anaplan admin + IT team)

---

## 2. Workday Adaptive Planning

**Market Position**: Second-largest EPM platform, strong in mid-market

**Integration Options**:
1. **Scheduled Report Export** (Recommended) - Native S3/SFTP export
2. **Workday API** - REST API integration

### 2.1 Setup via Scheduled Report

**Steps**:

1. **Create Custom Report**:
   ```
   Navigate to: Reporting → Create Custom Report
   - Name: "SpendFlo Budget Export"
   - Rows: Department, Account
   - Columns: Time (Version=Budget)
   - Values: Budget Amount, Currency
   - Format: CSV
   - Save report
   ```

2. **Schedule Report Export**:
   ```
   Navigate to: Report → Schedule
   - Frequency: Daily at 2:00 AM
   - Output Destination: Select "SFTP" or "Amazon S3"

   For SFTP:
   - Host: sftp.spendflo.com
   - Port: 22
   - Username: <provided-by-spendflo>
   - Password: <provided-by-spendflo>
   - Directory: /uploads/budgets/

   For S3:
   - Bucket: spendflo-budget-uploads
   - Region: us-east-1
   - Access Key: <provided-by-spendflo>
   - Secret Key: <provided-by-spendflo>
   - Prefix: customers/<your-id>/budgets/

   - File naming: budget_%Y%m%d.csv
   - Save schedule
   ```

**Expected Export Format**:
```csv
Department,Account,Time,Budget Amount,Currency
Engineering,Software Subscriptions,FY 2025,500000,USD
Engineering,Hardware,FY 2025,100000,USD
Sales,Travel,FY 2025,75000,USD
```

**Common Issues**:
- ❌ Report includes actuals → Filter version to "Budget" only
- ❌ Multiple time periods → Filter to current fiscal year
- ❌ SFTP connection fails → Whitelist Workday IPs on SpendFlo firewall

**Setup Time**: 1 hour

---

## 3. Oracle EPM Cloud (formerly Hyperion)

**Market Position**: Enterprise-grade EPM, dominant in large enterprises

**Integration Options**:
1. **EPM Automate** (Recommended) - CLI tool for batch operations
2. **REST API** - Direct API integration
3. **SmartView Export** - Excel-based export (manual)

### 3.1 Setup via EPM Automate

**Prerequisites**:
- EPM Automate installed on Windows/Linux server
- Service Administrator access

**Steps**:

1. **Create SmartView Report**:
   ```
   Open Excel → SmartView → Create Ad Hoc Analysis
   - POV: Version=Budget, Year=Current
   - Rows: Entity (Department), Account
   - Columns: Period (optional)
   - Members: All departments, all accounts
   - Save report as "SpendFlo_Budget_Export.xlsx"
   - Upload to EPM: File → Upload
   ```

2. **Create EPM Automate Script** (`spendflo-sync.bat`):
   ```batch
   @echo off

   REM Login to EPM Cloud
   epmautomate login your-service-account@company.com your-password your-service-url

   REM Export budget report
   epmautomate exportreport "SpendFlo_Budget_Export" "C:\Exports\budget_export.xlsx"

   REM Convert Excel to CSV
   powershell -Command "Import-Excel C:\Exports\budget_export.xlsx | Export-Csv C:\Exports\budget_export.csv -NoTypeInformation"

   REM Upload to SpendFlo SFTP
   pscp -pw spendflo-sftp-password C:\Exports\budget_export.csv your-company@sftp.spendflo.com:/uploads/budgets/budget_%date:~-4,4%%date:~-10,2%%date:~-7,2%.csv

   REM Logout
   epmautomate logout

   echo Budget sync completed: %date% %time%
   ```

3. **Schedule with Windows Task Scheduler**:
   ```
   - Trigger: Daily at 2:00 AM
   - Action: Run program → C:\Scripts\spendflo-sync.bat
   - Settings: Run whether user is logged on or not
   ```

**Expected Export Format**:
```csv
Entity,Account,Period,Budget Amount,Currency
10000 - Engineering,61000 - Software,FY25,500000,USD
10000 - Engineering,62000 - Hardware,FY25,100000,USD
20000 - Sales,63000 - Travel,FY25,75000,USD
```

**Common Issues**:
- ❌ EPM Automate authentication fails → Use service account with API access
- ❌ Excel conversion fails → Install ImportExcel PowerShell module
- ❌ Report too large → Add filters (current year only, top-level departments)

**Setup Time**: 2-3 hours (requires Oracle EPM admin)

---

## 4. Prophix

**Market Position**: Mid-market FP&A platform, strong in manufacturing

**Integration Options**:
1. **Prophix Automation** (Recommended) - Built-in scheduler
2. **Database Direct Query** - SQL export from Prophix database

### 4.1 Setup via Prophix Automation

**Steps**:

1. **Create Cube View Export**:
   ```
   Navigate to: Cubes → Your Budget Cube → Views
   - Create new view: "SpendFlo Budget Export"
   - Rows: Organization (Department)
   - Columns: Time (Current FY), Accounts
   - Measures: Budget Amount, Currency
   - Format: CSV
   - Save view
   ```

2. **Configure Automation**:
   ```
   Navigate to: Administration → Automation → Create New Job
   - Name: "SpendFlo Daily Budget Sync"
   - Type: Export Data
   - Source: Cube View "SpendFlo Budget Export"
   - Destination: FTP/SFTP
   - Schedule: Daily 2:00 AM
   - FTP Settings:
     * Host: sftp.spendflo.com
     * Port: 22
     * Protocol: SFTP
     * Username: <provided>
     * Password: <provided>
     * Directory: /uploads/budgets/
     * Filename: budget_%Y%m%d.csv
   - Save job
   ```

**Expected Export Format**:
```csv
Organization,Account,Period,Budget_Amount,Currency_Code
ENG - Engineering,SW - Software,FY 2025,500000,USD
ENG - Engineering,HW - Hardware,FY 2025,100000,USD
SAL - Sales,TRV - Travel,FY 2025,75000,USD
```

**Common Issues**:
- ❌ Column names with underscores → SpendFlo AI mapper handles this
- ❌ Organization codes instead of names → Include both Code and Name in export
- ❌ SFTP connection fails → Verify Prophix server can reach SpendFlo SFTP

**Setup Time**: 1-2 hours

---

## 5. IBM Planning Analytics (TM1)

**Market Position**: Legacy CPM platform, still used in large enterprises

**Integration Options**:
1. **TM1 Process (TurboIntegrator)** - Export cube to file
2. **REST API** - Planning Analytics API

### 5.1 Setup via TurboIntegrator

**Steps**:

1. **Create TI Process for Export**:
   ```
   Navigate to: Server Explorer → Processes → Create New
   - Name: "SpendFlo_Budget_Export"
   - Data Source: Cube View (Budget Cube)
   - Dimensions: Department, Account, Period
   - Export to: ASCII Delimited Text
   - Delimiter: Comma
   - Output: /exports/budget_export.csv
   ```

2. **Add Code to TI Process**:
   ```
   # Prolog tab:
   TextOutput('/exports/budget_export.csv', 'Department', 'Account', 'Period', 'Budget Amount', 'Currency');

   # Data tab:
   IF (vVersion @= 'Budget');
     TextOutput('/exports/budget_export.csv',
       vDepartment,
       vAccount,
       vPeriod,
       NumberToString(vBudgetAmount),
       vCurrency
     );
   ENDIF;
   ```

3. **Schedule TI Process**:
   ```
   Navigate to: Chores → Create New Chore
   - Name: "SpendFlo Daily Sync"
   - Add process: "SpendFlo_Budget_Export"
   - Schedule: Daily 2:00 AM (via Windows Task Scheduler)
   ```

4. **Upload to SpendFlo SFTP** (separate script):
   ```bash
   #!/bin/bash
   sshpass -p "$SFTP_PASS" sftp $SFTP_USER@sftp.spendflo.com <<EOF
   cd /uploads/budgets
   put /exports/budget_export.csv budget_$(date +%Y%m%d).csv
   bye
   EOF
   ```

**Setup Time**: 2 hours (requires TM1 admin)

---

## 6. SAP BPC (Business Planning & Consolidation)

**Market Position**: Enterprise EPM, integrated with SAP ecosystem

**Integration Options**:
1. **BW Query Export** (Recommended) - Export via SAP BW
2. **SAP RFC** - Remote function call
3. **SAP Data Services** - ETL tool

### 6.1 Setup via BW Query

**Steps**:

1. **Create BW Query**:
   ```
   Transaction: RSRT (Query Monitor)
   - Create query on BPC InfoCube
   - Characteristics: Department, Account, Time
   - Key Figures: Budget Amount, Currency
   - Filters: Version=Budget, Year=Current
   - Save query: "ZSPENDFLO_BUDGET_EXPORT"
   ```

2. **Schedule Background Job**:
   ```
   Transaction: SM36 (Define Background Job)
   - Job name: SPENDFLO_BUDGET_SYNC
   - Priority: C (Normal)
   - Target host: (Application server)
   - Start condition: Date/Time (Daily 02:00)
   - Add step:
     * Program: RSCRM_BAPI (Query Execution)
     * Variant: Create variant with:
       - Query: ZSPENDFLO_BUDGET_EXPORT
       - Output: File (CSV)
       - Path: /interfaces/spendflo/budget_export.csv
   - Schedule job
   ```

3. **Upload to SFTP** (separate script on SAP server):
   ```bash
   #!/bin/bash
   sftp $SFTP_USER@sftp.spendflo.com <<EOF
   cd /uploads/budgets
   put /interfaces/spendflo/budget_export.csv budget_$(date +%Y%m%d).csv
   bye
   EOF
   ```

**Setup Time**: 2-3 hours (requires SAP BW admin + Basis team)

---

## 7. Planful (formerly Host Analytics)

**Market Position**: Mid-market cloud FP&A platform

**Integration Options**:
1. **Scheduled Report Export** (Recommended)
2. **Planful API**

### 7.1 Setup via Scheduled Report

**Steps**:

1. **Create Report**:
   ```
   Navigate to: Reports → Create New Report
   - Type: Financial Report
   - Dimensions: Department, Account, Time
   - Filters: Version=Budget
   - Format: CSV
   - Save as: "SpendFlo Budget Export"
   ```

2. **Schedule Export**:
   ```
   Navigate to: Report → Schedule
   - Frequency: Daily 2:00 AM
   - Delivery: FTP
   - FTP Host: sftp.spendflo.com
   - Username/Password: <provided>
   - Directory: /uploads/budgets/
   - Filename: budget_%Y%m%d.csv
   ```

**Setup Time**: 1 hour

---

## 8. Google Sheets

**Market Position**: Lightweight budgeting, popular with startups/SMBs

**Integration Options**:
1. **Google Apps Script** (Recommended) - Automated export
2. **Google Sheets API** - Direct API access
3. **Manual Export** - Download CSV manually

### 8.1 Setup via Google Apps Script

**Steps**:

1. **Open your budget spreadsheet**
2. **Extensions → Apps Script**
3. **Paste this code**:
   ```javascript
   function exportToSpendFlo() {
     // Get budget data from sheet
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Budget 2025');
     var data = sheet.getDataRange().getValues();

     // Convert to CSV
     var csv = data.map(row => row.join(',')).join('\n');

     // Upload to SpendFlo SFTP (via webhook)
     var url = 'https://api.spendflo.com/api/sync/upload';
     var options = {
       'method': 'post',
       'contentType': 'text/csv',
       'payload': csv,
       'headers': {
         'Authorization': 'Bearer <your-spendflo-api-key>',
         'X-Customer-ID': '<your-customer-id>'
       }
     };

     UrlFetchApp.fetch(url, options);
     Logger.log('Budget exported to SpendFlo');
   }

   function createDailyTrigger() {
     ScriptApp.newTrigger('exportToSpendFlo')
       .timeBased()
       .atHour(2)
       .everyDays(1)
       .create();
   }
   ```

4. **Run `createDailyTrigger()` once to schedule**

**Setup Time**: 15-30 minutes

---

## 9. Excel (Manual Process)

**Market Position**: Universal tool, used for basic budgeting

**Integration Options**:
1. **Manual Upload to SpendFlo UI** (Simplest)
2. **SFTP Script** (for regular updates)

### 9.1 Setup via Manual Upload

**Steps**:

1. **Prepare Excel file**:
   - Ensure columns: Department, Fiscal Period, Budget Amount
   - Save as CSV

2. **Upload to SpendFlo**:
   - Log in to SpendFlo
   - Go to **Budgets → Import**
   - Click "Upload File"
   - Select CSV file
   - SpendFlo AI will auto-map columns
   - Review and confirm
   - Click "Import"

**Setup Time**: 10 minutes

---

## Summary Recommendation Matrix

**Choose SFTP if**:
- Enterprise FP&A tool (Anaplan, Oracle, SAP)
- Customer prefers not giving API access
- On-premise systems

**Choose S3 if**:
- Cloud-native company on AWS
- High-volume data transfers
- FP&A tool supports S3 natively

**Choose Manual Upload if**:
- Excel-based budgeting
- Budgets updated infrequently (monthly/quarterly)
- Small company (<50 departments)

**Choose API if**:
- Real-time sync needed (unusual for budgets)
- FP&A tool has robust API (Workday, Google Sheets)

---

## Support

For tool-specific questions:
- **Email**: integrations@spendflo.com
- **Slack**: #budget-sync-support
- **Docs**: https://docs.spendflo.com/budget-sync
