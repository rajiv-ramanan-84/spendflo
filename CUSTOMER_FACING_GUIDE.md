# Budget Sync System - Customer-Facing Team Guide

**Audience:** Support, Sales, Customer Success, Implementation
**Purpose:** Help customers set up and use budget import features

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Customer Benefits](#customer-benefits)
3. [How to Demo](#how-to-demo)
4. [Onboarding Customers](#onboarding-customers)
5. [Common Questions](#common-questions)
6. [Troubleshooting](#troubleshooting)
7. [Support Playbooks](#support-playbooks)

---

## Feature Overview

### What Is Budget Sync?

Budget Sync allows customers to automatically import and sync their budget data from Excel files, SFTP servers, S3 buckets, or Google Sheets into SpendFlo.

### Key Features

**✨ Smart Upload**
- Upload Excel or CSV files
- AI automatically maps columns
- Detects and warns about wrong file types (payroll, invoices, etc.)

**🤖 Automated Sync**
- SFTP: Customer drops files on SFTP server, we pull them automatically
- S3: We pull files from customer's S3 bucket
- Google Sheets: We sync directly from their sheets

**✅ Real-Time Validation**
- Check budget availability before purchases
- Auto-approve within policy
- Prevent overspending

**📊 Complete Visibility**
- See all imported budgets in dashboard
- Track import history
- Monitor budget utilization

---

## Customer Benefits

### Time Savings

| Task | Before | After | Savings |
|------|--------|-------|---------|
| Budget setup | 2-4 hours | 5-10 minutes | **95% faster** |
| Monthly updates | 1 hour | Automatic | **100% elimination** |
| Data entry errors | Manual fixes | AI prevents | **~15 errors/month avoided** |

### Business Impact

**For Finance Teams:**
- ✅ No more manual data entry
- ✅ Always up-to-date budgets
- ✅ Automated approval workflows
- ✅ Real-time budget visibility

**For Procurement Teams:**
- ✅ Instant budget checks
- ✅ Auto-approve low-risk purchases
- ✅ Prevent overspending
- ✅ Faster purchase approvals

**For IT Teams:**
- ✅ SFTP/S3 integration = hands-off
- ✅ Enterprise security standards
- ✅ Audit trail included
- ✅ No manual processes to maintain

---

## How to Demo

### 5-Minute Demo Script

**Slide 1: The Problem (30 seconds)**
> "Right now, updating budgets in procurement systems is painful. Finance teams spend hours manually entering data, and it's error-prone. Let me show you a better way."

**Slide 2: Smart Upload (2 minutes)**

1. Open: `https://app.spendflo.com/fpa/import`
2. Click "Upload Excel"
3. Select sample budget file
4. **Point out:** "See how the AI automatically detected which columns are departments, budgets, and time periods? No manual mapping needed."
5. Click "Import"
6. **Point out:** "15 budgets imported in 5 seconds. That would have taken 30+ minutes manually."

**Slide 3: Wrong File Protection (1 minute)**

1. Upload payroll file (or mention it)
2. **Point out:** "The system detected this is payroll data, not budgets, and warns you. This prevents costly mistakes."

**Slide 4: Automation (1 minute)**

> "Once you're set up, we can pull files automatically:
> - Drop files on your SFTP server → We import them daily
> - Update your Google Sheet → We sync it automatically
> - Upload to S3 bucket → We detect and process new files
>
> Your budgets stay updated without anyone lifting a finger."

**Slide 5: Budget Checks (30 seconds)**

> "When someone requests a purchase, we check budgets in real-time:
> - Budget available + under threshold = Auto-approved
> - Budget available + over threshold = Routed to FP&A
> - No budget = Rejected automatically
>
> Your approval workflows become faster and smarter."

**Close: ROI Summary (30 seconds)**
> "You save 2-4 hours per month per finance team member. That's $2,000-$4,000 per year in labor costs alone. Plus fewer errors, faster approvals, and better budget control."

---

## Onboarding Customers

### Pre-Implementation Checklist

**Discovery Questions:**

1. **Current Process**
   - [ ] How do you manage budgets today?
   - [ ] What format are your budget files? (Excel, CSV, ERP export)
   - [ ] How often do budgets change?
   - [ ] Who maintains budgets?

2. **File Format**
   - [ ] Can we see a sample budget file?
   - [ ] What columns do you have?
   - [ ] Any unusual formats or quirks?

3. **Automation Needs**
   - [ ] Want automated sync? (SFTP/S3/Sheets)
   - [ ] If yes, who sets up SFTP/S3?
   - [ ] What's the update frequency?

4. **Approval Workflow**
   - [ ] Current approval thresholds?
   - [ ] Who approves what amounts?
   - [ ] Want auto-approval for small purchases?

---

### Implementation Steps

#### Step 1: Test Import (15 minutes)

1. **Get sample file from customer**
   - Ask: "Can you send us a sample budget file?"
   - Verify it has: Department, Fiscal Period, Budget Amount

2. **Test upload**
   - Log into customer's account
   - Go to: Budget Import page
   - Upload their file
   - Verify AI mapping looks correct
   - Click Import

3. **Verify data**
   - Check budgets appear on dashboard
   - Confirm amounts are correct
   - Ask customer to review

**If file format issues:**
- Take screenshot of columns
- Ask: "What should this column map to?"
- Use manual mapping if needed
- Document for future reference

---

#### Step 2: Set Up Automation (Optional, 30 minutes)

**For SFTP:**

1. **Get credentials from customer:**
   ```
   Host: sftp.customer.com
   Port: 22 (usually)
   Username: spendflo
   Password: ***
   Directory: /budgets/
   File pattern: budget*.csv
   ```

2. **Test connection:**
   - Use SFTP client to verify access
   - Check files are readable
   - Verify directory permissions

3. **Configure in SpendFlo:**
   - Add SFTP config in admin panel
   - Set schedule (daily at 2am recommended)
   - Enable sync

4. **Verify first sync:**
   - Wait for scheduled time OR trigger manual sync
   - Check import history
   - Verify budgets imported correctly

**For S3:**

1. **Get AWS credentials:**
   ```
   Bucket: customer-budgets
   Region: us-east-1
   Access Key ID: ***
   Secret Access Key: ***
   Prefix: budgets/
   ```

2. **Test access:**
   ```bash
   aws s3 ls s3://customer-budgets/budgets/ --profile customer
   ```

3. **Configure in SpendFlo**
4. **Verify first sync**

**For Google Sheets:**

1. Customer authorizes Google Sheets access
2. Select spreadsheet to sync
3. Map columns
4. Set sync frequency
5. Verify first sync

---

#### Step 3: Configure Approval Rules (10 minutes)

1. **Set department thresholds:**
   ```
   Engineering: $10,000 auto-approve
   Sales: $5,000 auto-approve
   Marketing: $7,500 auto-approve
   Finance: $3,000 auto-approve
   ```

2. **Test budget checks:**
   - Create test purchase request
   - Verify budget check works
   - Confirm auto-approval triggers correctly

---

#### Step 4: Train Customer (20 minutes)

**For Finance Team:**
- Show how to upload new budgets
- Explain AI mapping
- Demo import history
- Show dashboard

**For Procurement Team:**
- Explain budget checks in purchase flow
- Show when requests auto-approve
- Explain FP&A escalation

**For IT Team:**
- Explain SFTP/S3 setup (if using)
- Share troubleshooting guide
- Provide support contact

---

## Common Questions

### General

**Q: What file formats do you support?**
A: Excel (.xlsx, .xls), CSV, and Google Sheets. Most ERP exports work fine.

**Q: Can you handle our specific format?**
A: Yes! Our AI handles most formats automatically. If it's unusual, we can test with your sample file and adjust if needed.

**Q: What if our column names are different?**
A: The AI handles variations automatically (e.g., "Dept" = "Department", "Budget Amt" = "Budgeted Amount"). You can also manually map columns.

**Q: Is our data secure?**
A: Yes. Files are encrypted in transit (HTTPS), stored temporarily (7 days), then deleted. SFTP/S3 credentials are encrypted in our database.

---

### File Upload

**Q: Why is it saying "This looks like a payroll file"?**
A: The AI detected keywords like "salary", "employee", etc. This prevents accidental wrong file uploads. If it's actually a budget file with unusual names, you can click "Continue Anyway".

**Q: Import failed. What happened?**
A: Check the error message. Common issues:
- Missing required columns (Department, Fiscal Period, Budget Amount)
- Invalid amounts (non-numeric values)
- Wrong file encoding

**Q: Can I import multiple years at once?**
A: Yes! Just include all data in one file. The Fiscal Period column differentiates them.

**Q: What if I need to update budgets?**
A: Just upload a new file. New budgets are added, existing ones can be updated.

---

### Automation

**Q: How often does SFTP sync run?**
A: By default, daily at 2am. We can customize the schedule.

**Q: What happens if the SFTP connection fails?**
A: You'll receive an alert email. The sync will retry automatically. Manual upload is always available as backup.

**Q: Can we test SFTP before going live?**
A: Yes! We do a test sync during implementation to verify everything works.

**Q: Do you delete files from our SFTP server?**
A: No, we only download. You control file retention on your server.

---

### Budget Checks

**Q: How does auto-approval work?**
A: Requests are auto-approved if:
1. Budget is available
2. Amount is under department threshold
3. Budget utilization is under 90%

**Q: What are the thresholds?**
A: Default thresholds by department:
- Engineering: $10,000
- Sales: $5,000
- Marketing: $7,500
- Finance: $3,000
- Others: $5,000

These can be customized per customer.

**Q: What if multiple people request from the same budget?**
A: We track pending requests (last 48 hours) and account for them in availability calculations to prevent overspending.

**Q: Can we have different thresholds by department?**
A: Yes! Thresholds are configurable per department.

---

## Troubleshooting

### Issue: Import Failed

**Symptom:** Error message "Import failed"

**Diagnosis:**
1. Check error message in import history
2. Common causes:
   - Missing required columns
   - Invalid data (non-numeric amounts)
   - File encoding issues
   - Empty file

**Resolution:**
1. Open the file in Excel
2. Verify required columns exist:
   - Department (text)
   - Fiscal Period (text, e.g., "FY2025")
   - Budget Amount (number, e.g., 50000)
3. Check for:
   - Empty rows (delete them)
   - Text in amount columns (fix to numbers)
   - Special characters in column names (remove)
4. Re-upload

**If still failing:**
- Get the file from customer
- Send to engineering: [support email]
- Include error message screenshot

---

### Issue: Wrong File Type Warning

**Symptom:** "This looks like a payroll file" warning

**Diagnosis:**
- AI detected keywords like "salary", "employee", etc.
- File may actually be wrong type OR
- Budget file with unusual column names

**Resolution:**
1. Ask customer: "Is this definitely a budget file?"
2. If YES:
   - Click "Continue Anyway"
   - Import will proceed with warning
3. If NO:
   - Cancel
   - Ask for correct budget file

**When to escalate:**
- Customer insists it's a budget file
- Import fails even after continuing
- Unusual format needs engineering review

---

### Issue: SFTP Connection Failed

**Symptom:** Alert: "SFTP sync failed for customer X"

**Diagnosis:**
1. Check error message:
   - "Connection refused" = Network/firewall issue
   - "Authentication failed" = Wrong credentials
   - "Permission denied" = Directory access issue

**Resolution:**

**For "Connection refused":**
1. Verify host and port with customer
2. Ask: "Can you access the SFTP from your office?"
3. Check if IP whitelist needed
4. Test connection manually:
   ```bash
   sftp -P 22 username@hostname
   ```

**For "Authentication failed":**
1. Verify credentials with customer
2. Ask them to test login
3. Update credentials in SpendFlo

**For "Permission denied":**
1. Verify directory path with customer
2. Ask: "Does the SpendFlo user have read access to /budgets/?"
3. May need customer IT to fix permissions

---

### Issue: Budget Check Returns "Not Available" but Budget Exists

**Symptom:** Purchase request rejected but customer says budget exists

**Diagnosis:**
1. Check budget in dashboard
2. Verify fiscal period matches
3. Check sub-category (must match exactly or be null)
4. Check utilization

**Resolution:**
1. Go to Budgets page
2. Search for department + fiscal period
3. Check available amount: `Budgeted - Committed - Reserved`
4. If available amount < requested: Explain to customer
5. If budget doesn't match: Check if sub-category or period is different
6. If still issues: Check with engineering

---

## Support Playbooks

### Playbook: New Customer Onboarding

**When:** New customer wants to use budget imports

**Time:** 30-45 minutes

**Steps:**

1. **Discovery (5 min)**
   - [ ] Ask about current budget process
   - [ ] Get sample budget file
   - [ ] Understand update frequency

2. **Test Import (10 min)**
   - [ ] Upload sample file
   - [ ] Verify AI mapping
   - [ ] Execute import
   - [ ] Show results to customer

3. **Automation Setup (15 min, if needed)**
   - [ ] Get SFTP/S3/Sheets credentials
   - [ ] Test connection
   - [ ] Configure sync schedule
   - [ ] Run test sync

4. **Training (10 min)**
   - [ ] Show upload process
   - [ ] Explain warnings
   - [ ] Demo dashboard
   - [ ] Share documentation

5. **Follow-up (next day)**
   - [ ] Check first automated sync (if applicable)
   - [ ] Answer any questions
   - [ ] Mark onboarding complete

---

### Playbook: File Format Issues

**When:** Customer's file won't import correctly

**Time:** 10-20 minutes

**Steps:**

1. **Get the file**
   - [ ] Ask customer to send file (email or secure link)
   - [ ] Download and open in Excel

2. **Inspect format**
   - [ ] Check for required columns (Department, Fiscal Period, Budget Amount)
   - [ ] Look for unusual formatting
   - [ ] Check for empty rows
   - [ ] Verify amounts are numbers (not text)

3. **Test manually**
   - [ ] Upload to test environment
   - [ ] Check error message
   - [ ] Note which mappings failed

4. **Fix or escalate**
   - **If simple fix:**
     - [ ] Guide customer to fix file
     - [ ] Test again
   - **If complex:**
     - [ ] Send file to engineering
     - [ ] Create ticket
     - [ ] Update customer with timeline

---

### Playbook: SFTP Troubleshooting

**When:** Automated SFTP sync failing

**Time:** 15-30 minutes

**Steps:**

1. **Check error logs**
   - [ ] Go to Import History
   - [ ] Find failed sync
   - [ ] Read error message

2. **Test connection**
   - [ ] Use SFTP client
   - [ ] Try to connect with same credentials
   - [ ] Document what happens

3. **Customer communication**
   - [ ] Email customer IT team
   - [ ] Include error message
   - [ ] Ask for verification of:
     - [ ] Host/port correct
     - [ ] Credentials valid
     - [ ] Directory accessible
     - [ ] Network/firewall allows connection

4. **Resolution**
   - [ ] Update credentials if changed
   - [ ] Fix directory path if wrong
   - [ ] Work with customer IT on firewall
   - [ ] Re-enable sync once working

5. **Verify**
   - [ ] Trigger manual sync test
   - [ ] Check import history shows success
   - [ ] Monitor next scheduled sync

---

## Quick Reference

### Key Links

- **Import Page:** `/fpa/import`
- **Budget Dashboard:** `/dashboard`
- **Import History:** `/api/imports/history`
- **Test Interface:** `/test-import.html` (internal)

### Support Contacts

- **Engineering:** [Email/Slack]
- **Product:** [Email/Slack]
- **Documentation:** [Link to knowledge base]

### File Requirements

**Required Columns:**
- Department (text)
- Fiscal Period (text)
- Budget Amount (number)

**Optional Columns:**
- Sub-Category
- Currency

**Supported Formats:**
- Excel: .xlsx, .xls
- CSV: .csv
- Max size: 10MB
- Max rows: 10,000 (recommended)

### Auto-Approval Thresholds

| Department | Threshold |
|-----------|-----------|
| Engineering | $10,000 |
| Sales | $5,000 |
| Marketing | $7,500 |
| Finance | $3,000 |
| HR | $5,000 |
| Others | $5,000 |

---

## Success Metrics

### Track These for Your Customers

- ⏱️ **Time to First Import:** Target <15 minutes
- ✅ **Import Success Rate:** Target >95%
- 🔄 **Automation Adoption:** % of customers using SFTP/S3
- 🎯 **Auto-Approval Rate:** % of requests auto-approved
- 😊 **Customer Satisfaction:** Survey score

---

## Training Resources

### New Team Members

**Watch:**
- 5-minute product demo video
- Customer onboarding walkthrough

**Read:**
- This guide
- FILE_TYPE_DETECTION_GUIDE.md
- BUDGET_CHECK_API_GUIDE.md

**Practice:**
- Import sample file
- Test wrong file warning
- Run through onboarding playbook

### Customer Resources

**To Share:**
- Quick start guide (1-pager)
- Video tutorial (link)
- Sample budget template
- FAQ document

---

## Feedback

Found issues or have suggestions? Contact:
- **Product:** [Email]
- **Engineering:** [Email]
- **Documentation:** [Email]

Help us improve this guide for the next person! 🚀
