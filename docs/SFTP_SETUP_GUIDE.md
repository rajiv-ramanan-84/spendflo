# SFTP Setup Guide for Customer IT Teams

**Setting up automated budget file exports to SpendFlo via SFTP**

---

## Overview

This guide helps your IT team set up automated budget exports from your FP&A tool to SpendFlo using SFTP (Secure File Transfer Protocol).

**What You'll Accomplish:**
1. Configure your FP&A tool to export budget data daily
2. Set up SFTP connection to SpendFlo
3. Schedule automated file transfer
4. Verify sync is working

**Time Required**: 1-2 hours

**Prerequisites**:
- Admin access to your FP&A tool
- Ability to schedule cron jobs or use task scheduler
- SFTP client (OpenSSH, FileZilla, WinSCP, etc.)

---

## Step 1: Get SpendFlo SFTP Credentials

Contact SpendFlo support to receive your dedicated SFTP credentials:

```
Host: sftp.spendflo.com
Port: 22
Username: <your-company>_budget_sync
Password: <provided-by-spendflo>
Directory: /uploads/budgets/
```

**Security Note**: These credentials are unique to your company and should be stored securely (password manager, secrets vault, etc.).

---

## Step 2: Test SFTP Connection

Before automating, test the connection manually:

### Using Command Line (Linux/Mac):
```bash
sftp -P 22 <username>@sftp.spendflo.com
# Enter password when prompted
cd /uploads/budgets/
ls
# You should see the budgets directory
exit
```

### Using FileZilla (Windows/Mac):
1. Open FileZilla
2. File → Site Manager → New Site
3. Enter connection details:
   - **Protocol**: SFTP
   - **Host**: sftp.spendflo.com
   - **Port**: 22
   - **Logon Type**: Normal
   - **User**: (your username)
   - **Password**: (your password)
4. Click "Connect"
5. Navigate to `/uploads/budgets/`

### Using WinSCP (Windows):
1. Open WinSCP
2. New Site
3. File protocol: SFTP
4. Host name: sftp.spendflo.com
5. Port: 22
6. Username / Password: (provided credentials)
7. Click "Login"

**Expected Result**: You should see an empty directory or existing budget files.

---

## Step 3: Export Budget Data from Your FP&A Tool

### 3.1 Determine Export Format

SpendFlo accepts CSV or Excel files with the following columns:

**Required Columns**:
- Department name (e.g., "Engineering", "Sales", "Marketing")
- Budget amount (numeric value)
- Fiscal period (e.g., "FY 2025", "Q1 2025", "January 2025")

**Optional Columns**:
- Sub-category (e.g., "Software", "Hardware", "Travel")
- Currency code (e.g., "USD", "EUR", "GBP") - defaults to USD if missing

**Example CSV**:
```csv
Department,Sub Category,Fiscal Period,Budget Amount,Currency
Engineering,Software,FY 2025,500000,USD
Engineering,Hardware,FY 2025,100000,USD
Sales,Travel,FY 2025,75000,USD
Marketing,Advertising,FY 2025,200000,USD
```

**Important Notes**:
- Column names can vary (SpendFlo AI will detect them)
- Examples: "Dept" vs "Department", "Amount" vs "Budget Amount", etc.
- First row must be headers
- No empty rows between data
- Numeric amounts should not include currency symbols ($, €, etc.)

### 3.2 Configure Export in Your FP&A Tool

**For Anaplan**:
```
1. Go to Actions → Export Actions
2. Create new export: "SpendFlo Budget Export"
3. Select your budget model/module
4. Choose columns: Department, Amount, Period, Currency
5. Format: CSV
6. Save action
```

**For Prophix**:
```
1. Go to Cubes → Your Budget Cube
2. Reports → Create Export Report
3. Include dimensions: Organization, Account, Period
4. Include measures: Budget Amount, Currency
5. Format: CSV
6. Save as "SpendFlo Budget Export"
```

**For Workday Adaptive**:
```
1. Go to Reports → Create Custom Report
2. Add rows: Department, Account
3. Add columns: Time Period, Budget Amount
4. Format: CSV
5. Schedule report (see Step 4)
```

**For Google Sheets**:
```
1. Open your budget spreadsheet
2. File → Download → CSV
3. Save to local directory
4. Use script to upload to SFTP (see Step 4)
```

**For Excel (Manual)**:
```
1. Open your Excel budget file
2. File → Save As → CSV (Comma delimited)
3. Upload to SFTP manually or via script
```

---

## Step 4: Schedule Automated Transfer

### Option A: Linux/Mac (cron job)

Create a shell script to export and upload:

**1. Create script: `/usr/local/bin/spendflo-budget-sync.sh`**
```bash
#!/bin/bash

# Configuration
SFTP_HOST="sftp.spendflo.com"
SFTP_USER="<your-username>"
SFTP_PASS="<your-password>"
SFTP_DIR="/uploads/budgets"
LOCAL_FILE="/path/to/your/budget-export.csv"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REMOTE_FILE="budget_${TIMESTAMP}.csv"

# Step 1: Export from your FP&A tool (tool-specific command)
# Example for Anaplan:
# anaplan-connect export --model Budget --action "SpendFlo Export" --output $LOCAL_FILE

# Example for custom database:
# mysql -u user -p password -e "SELECT * FROM budgets" > $LOCAL_FILE

# Step 2: Upload to SFTP
sshpass -p "$SFTP_PASS" sftp -oBatchMode=no -oStrictHostKeyChecking=no -P 22 $SFTP_USER@$SFTP_HOST <<EOF
cd $SFTP_DIR
put $LOCAL_FILE $REMOTE_FILE
bye
EOF

echo "[$(date)] Budget sync completed: $REMOTE_FILE"
```

**2. Make script executable:**
```bash
chmod +x /usr/local/bin/spendflo-budget-sync.sh
```

**3. Schedule with cron (daily at 2 AM):**
```bash
crontab -e
```

Add this line:
```
0 2 * * * /usr/local/bin/spendflo-budget-sync.sh >> /var/log/spendflo-sync.log 2>&1
```

### Option B: Windows (Task Scheduler)

**1. Create PowerShell script: `C:\Scripts\SpendFlo-Budget-Sync.ps1`**
```powershell
# Configuration
$SFTPHost = "sftp.spendflo.com"
$SFTPUser = "<your-username>"
$SFTPPass = "<your-password>"
$LocalFile = "C:\Exports\budget-export.csv"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$RemoteFile = "budget_$Timestamp.csv"

# Step 1: Export from your FP&A tool
# (Tool-specific command here)

# Step 2: Upload via WinSCP
$Session = New-Object WinSCP.Session
try {
    $SessionOptions = New-Object WinSCP.SessionOptions -Property @{
        Protocol = [WinSCP.Protocol]::Sftp
        HostName = $SFTPHost
        UserName = $SFTPUser
        Password = $SFTPPass
    }

    $Session.Open($SessionOptions)
    $Session.PutFiles($LocalFile, "/uploads/budgets/$RemoteFile").Check()

    Write-Host "Upload successful: $RemoteFile"
}
finally {
    $Session.Dispose()
}
```

**2. Schedule with Task Scheduler:**
```
1. Open Task Scheduler
2. Create Basic Task → "SpendFlo Budget Sync"
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
   - Program: powershell.exe
   - Arguments: -ExecutionPolicy Bypass -File "C:\Scripts\SpendFlo-Budget-Sync.ps1"
5. Finish
```

### Option C: Cloud Scheduler (AWS/GCP/Azure)

**AWS Lambda + EventBridge**:
```python
import boto3
import paramiko
from datetime import datetime

def lambda_handler(event, context):
    # Export budget from your system
    budget_data = export_budget_data()  # Your export logic

    # Upload to SpendFlo SFTP
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('sftp.spendflo.com', username='<user>', password='<pass>')

    sftp = ssh.open_sftp()
    sftp.put('/tmp/budget.csv', f'/uploads/budgets/budget_{datetime.now().strftime("%Y%m%d")}.csv')
    sftp.close()
    ssh.close()

    return {'statusCode': 200, 'body': 'Sync complete'}
```

Schedule with EventBridge: Daily at 2 AM UTC

---

## Step 5: File Naming Convention

SpendFlo automatically processes any new files in the `/uploads/budgets/` directory.

**Recommended naming**:
```
budget_YYYYMMDD.csv
budget_YYYYMMDD_HHMMSS.csv
```

**Examples**:
- `budget_20250205.csv`
- `budget_20250205_140523.csv`
- `acme_corp_budget_20250205.csv`

**Important**:
- Use `.csv` or `.xlsx` extension
- Don't use spaces in filename (use underscores or hyphens)
- Include date in filename for easy tracking

---

## Step 6: Verify Sync is Working

### 6.1 Check File Uploaded Successfully

**Via SFTP**:
```bash
sftp <username>@sftp.spendflo.com
cd /uploads/budgets/
ls -ltr
# You should see your uploaded file
```

### 6.2 Check SpendFlo Sync Status

1. Log in to SpendFlo admin portal
2. Go to **Settings → Budget Sync → History**
3. Verify latest sync shows "Success" status
4. Check stats: Created, Updated, Errors

### 6.3 Verify Budget Data

1. Go to **Budgets** page in SpendFlo
2. Check that departments and amounts match your FP&A tool
3. Create test purchase request to verify budget checking works

---

## Step 7: Monitoring & Alerts

### Set up monitoring for:

1. **File Upload Failures**
   - Check SFTP logs for connection errors
   - Monitor cron job / task scheduler logs

2. **Sync Failures in SpendFlo**
   - Configure email alerts in SpendFlo
   - Check sync history daily for first week

3. **Data Quality Issues**
   - Review sync error reports
   - Fix data issues in source system

### Recommended Alert Thresholds:
- ⚠️ Warning: >5% rows with errors
- 🚨 Critical: Sync fails 2 consecutive times
- ℹ️ Info: New columns detected (AI mapper prompt)

---

## Troubleshooting

### Issue: "Connection Refused" or "Connection Timeout"

**Cause**: Firewall blocking SFTP connection

**Fix**:
1. Whitelist SpendFlo SFTP IPs in your firewall:
   - `54.x.x.x` (provide actual IPs)
   - `52.x.x.x` (provide actual IPs)
2. Allow outbound connections on port 22 (SFTP)
3. Test connection: `telnet sftp.spendflo.com 22`

### Issue: "Permission Denied" when uploading

**Cause**: Incorrect credentials or directory permissions

**Fix**:
1. Verify username/password are correct
2. Check you're uploading to `/uploads/budgets/` directory
3. Contact SpendFlo support to verify account permissions

### Issue: "File uploaded but sync shows 0 rows"

**Cause**: File format issue (empty file, wrong encoding, etc.)

**Fix**:
1. Open CSV file in text editor, verify it has data
2. Check file encoding is UTF-8
3. Verify first row has headers
4. Ensure no blank rows between data

### Issue: "Sync completed with errors"

**Cause**: Data validation failures (missing fields, invalid amounts, etc.)

**Fix**:
1. Download error report from SpendFlo sync history
2. Check which rows/fields failed
3. Fix data in source system
4. Re-run export and upload

---

## Security Best Practices

1. **Store credentials securely**:
   - Use password manager or secrets vault
   - Never commit credentials to version control
   - Rotate passwords every 90 days

2. **Use SSH keys (optional)**:
   - Generate SSH key pair
   - Provide public key to SpendFlo
   - Use private key for authentication (no password needed)

3. **Restrict access**:
   - Only authorized systems should have SFTP credentials
   - Use dedicated service account (not personal account)
   - Log all file transfers for audit

4. **Encrypt data at rest**:
   - Ensure FP&A tool data is encrypted
   - Use encrypted file system for local exports
   - SpendFlo encrypts all data in transit (SFTP) and at rest (S3)

---

## FAQ

**Q: How often should we upload files?**
A: Daily (2 AM local time) is recommended. SpendFlo polls every 4 hours to check for new files.

**Q: Can we upload multiple times per day?**
A: Yes! SpendFlo processes the most recent file. You can upload hourly if budgets change frequently.

**Q: What happens to old files?**
A: SpendFlo keeps files for 30 days for audit, then auto-deletes them.

**Q: Can we test without affecting production?**
A: Yes! Upload a file with "_test" in the filename. SpendFlo will process it separately.

**Q: Do we need to clean up old files?**
A: No. SpendFlo automatically cleans up files older than 30 days.

**Q: What if our column names change?**
A: SpendFlo AI mapper will detect new columns automatically. May prompt for confirmation.

**Q: Can we upload Excel instead of CSV?**
A: Yes! Both .csv and .xlsx are supported.

---

## Support Contacts

- **Technical Issues**: engineering@spendflo.com
- **SFTP Access Issues**: support@spendflo.com
- **Slack Channel**: #budget-sync-support

**Emergency Contact**: +1 (xxx) xxx-xxxx (24/7 support line)
