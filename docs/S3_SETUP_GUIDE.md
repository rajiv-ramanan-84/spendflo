# S3 Setup Guide for Customer IT Teams

**Setting up automated budget file exports to SpendFlo via Amazon S3**

---

## Overview

This guide helps your IT team set up automated budget exports from your FP&A tool to SpendFlo using Amazon S3.

**Best for:**
- Cloud-native companies already using AWS
- Customers who prefer S3 over SFTP
- High-volume data transfers

**What You'll Accomplish:**
1. Create S3 bucket (or use SpendFlo-provided bucket)
2. Configure bucket permissions
3. Set up automated file uploads from your FP&A tool
4. Verify sync is working

**Time Required**: 30-60 minutes

**Prerequisites**:
- AWS account access
- Ability to create/configure S3 buckets
- FP&A tool that can export to S3 (or use intermediate script)

---

## Option 1: Use SpendFlo-Provided S3 Bucket (Recommended)

### Step 1: Get S3 Credentials from SpendFlo

Contact SpendFlo support to receive:
```
Bucket Name: spendflo-budget-uploads
Region: us-east-1
Access Key ID: AKIA...
Secret Access Key: <provided-by-spendflo>
Prefix: customers/<your-company-id>/budgets/
```

### Step 2: Test S3 Access

**Using AWS CLI**:
```bash
# Configure AWS credentials
aws configure set aws_access_key_id <access-key-id>
aws configure set aws_secret_access_key <secret-access-key>
aws configure set region us-east-1

# Test access
aws s3 ls s3://spendflo-budget-uploads/customers/<your-company-id>/budgets/

# Expected output: Empty or list of existing files
```

**Using Python (boto3)**:
```python
import boto3

s3 = boto3.client('s3',
    aws_access_key_id='<access-key-id>',
    aws_secret_access_key='<secret-access-key>',
    region_name='us-east-1'
)

# List objects
response = s3.list_objects_v2(
    Bucket='spendflo-budget-uploads',
    Prefix='customers/<your-company-id>/budgets/'
)

print(response.get('Contents', []))
```

### Step 3: Upload Budget File

**Using AWS CLI**:
```bash
aws s3 cp /path/to/budget-export.csv s3://spendflo-budget-uploads/customers/<your-company-id>/budgets/budget_$(date +%Y%m%d).csv
```

**Using Python**:
```python
from datetime import datetime

s3.upload_file(
    '/path/to/budget-export.csv',
    'spendflo-budget-uploads',
    f'customers/<your-company-id>/budgets/budget_{datetime.now().strftime("%Y%m%d")}.csv'
)
```

---

## Option 2: Use Your Own S3 Bucket

### Step 1: Create S3 Bucket

```bash
aws s3 mb s3://your-company-budget-exports --region us-east-1
```

Or via AWS Console:
1. Go to S3 → Create Bucket
2. Bucket name: `your-company-budget-exports`
3. Region: Select closest to you
4. Disable "Block all public access" (will use IAM policies)
5. Click "Create bucket"

### Step 2: Create IAM User for SpendFlo

**Via AWS Console**:
1. Go to IAM → Users → Add User
2. User name: `spendflo-budget-sync`
3. Access type: Programmatic access
4. Attach policy: Create custom policy (see below)
5. Save Access Key ID and Secret Access Key

**IAM Policy** (allows SpendFlo read-only access):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-company-budget-exports",
        "arn:aws:s3:::your-company-budget-exports/*"
      ]
    }
  ]
}
```

### Step 3: Share Credentials with SpendFlo

Send to SpendFlo support:
```
Bucket Name: your-company-budget-exports
Region: us-east-1
Access Key ID: AKIA...
Secret Access Key: <secret>
Prefix: budgets/
```

**Security Note**: SpendFlo only needs read access (`s3:GetObject`, `s3:ListBucket`). Never grant write or delete permissions.

---

## Step 4: Automate Budget File Uploads

### Option A: AWS Lambda (Serverless)

**Use Case**: Your FP&A tool has API or database you can query

**Setup**:

1. **Create Lambda Function** (`budget-export-to-s3`):
```python
import boto3
import csv
from datetime import datetime

def lambda_handler(event, context):
    # Step 1: Fetch budget data from your FP&A tool
    # (Replace with your actual data source)
    budget_data = fetch_budget_data_from_fpa_tool()

    # Step 2: Write to CSV
    csv_file = '/tmp/budget_export.csv'
    with open(csv_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Department', 'Fiscal Period', 'Budget Amount', 'Currency'])
        writer.writeheader()
        writer.writerows(budget_data)

    # Step 3: Upload to S3
    s3 = boto3.client('s3')
    bucket = 'your-company-budget-exports'
    key = f'budgets/budget_{datetime.now().strftime("%Y%m%d")}.csv'

    s3.upload_file(csv_file, bucket, key)

    return {
        'statusCode': 200,
        'body': f'Uploaded: {key}'
    }

def fetch_budget_data_from_fpa_tool():
    # Example: Query database
    # import pymysql
    # conn = pymysql.connect(host='fpa-db', user='reader', password='xxx')
    # cursor = conn.cursor()
    # cursor.execute("SELECT department, period, amount, currency FROM budgets")
    # return [{'Department': row[0], 'Fiscal Period': row[1], 'Budget Amount': row[2], 'Currency': row[3]} for row in cursor.fetchall()]

    # Or: Call FP&A tool API
    # import requests
    # response = requests.get('https://fpa-tool.com/api/budgets')
    # return response.json()

    pass
```

2. **Schedule with EventBridge**:
```bash
aws events put-rule \
  --name spendflo-budget-sync-daily \
  --schedule-expression "cron(0 2 * * ? *)" \
  --state ENABLED

aws lambda add-permission \
  --function-name budget-export-to-s3 \
  --statement-id eventbridge-trigger \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com

aws events put-targets \
  --rule spendflo-budget-sync-daily \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:123456789:function:budget-export-to-s3"
```

### Option B: EC2 Cron Job

**Use Case**: Your FP&A tool runs on-premise or requires VPN access

**Setup**:

1. **Create script on EC2**: `/home/ec2-user/spendflo-budget-sync.sh`
```bash
#!/bin/bash

# Export budget from your FP&A tool
# (Replace with your actual export command)
python3 /home/ec2-user/export_budget.py

# Upload to S3
aws s3 cp /tmp/budget_export.csv s3://your-company-budget-exports/budgets/budget_$(date +%Y%m%d).csv

echo "[$(date)] Budget sync completed"
```

2. **Schedule with cron**:
```bash
crontab -e
# Add: 0 2 * * * /home/ec2-user/spendflo-budget-sync.sh >> /var/log/spendflo-sync.log 2>&1
```

### Option C: Direct from FP&A Tool

Some FP&A tools support direct S3 exports:

**Workday Adaptive Planning**:
```
1. Go to Reports → Schedule Report
2. Output Destination: Amazon S3
3. Bucket: your-company-budget-exports
4. Access Key ID: <your-key>
5. Secret Access Key: <your-secret>
6. Schedule: Daily 2 AM
```

**Anaplan (via Anaplan Connect)**:
```bash
# Configure Anaplan Connect with S3 output
java -cp anaplan-connect.jar \
  -export <model-id> \
  -action "Budget Export" \
  -output s3://your-company-budget-exports/budgets/budget.csv
```

---

## Step 5: Configure SpendFlo to Poll S3

### Via SpendFlo Admin Portal:

1. Log in to SpendFlo
2. Go to **Settings → Budget Sync**
3. Click **"Add New Sync Source"**
4. Fill in form:
   - **Source Type**: S3
   - **Bucket Name**: your-company-budget-exports
   - **Region**: us-east-1
   - **Access Key ID**: (SpendFlo's read-only key if using your bucket)
   - **Prefix**: budgets/
   - **Sync Frequency**: Every 4 hours (default)
5. Click **"Test Connection"**
6. Click **"Save"**

### Via API:

```bash
curl -X POST https://api.spendflo.com/api/sync/config \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "<your-customer-id>",
    "sourceType": "s3",
    "enabled": true,
    "frequency": "every_4_hours",
    "sourceConfig": {
      "bucketName": "your-company-budget-exports",
      "region": "us-east-1",
      "accessKeyId": "<key-id>",
      "secretAccessKey": "<secret>",
      "prefix": "budgets/"
    }
  }'
```

---

## Step 6: Verify Sync is Working

### 6.1 Check File in S3

```bash
aws s3 ls s3://your-company-budget-uploads/budgets/
# You should see: budget_20250205.csv
```

### 6.2 Check SpendFlo Sync Status

1. Log in to SpendFlo
2. Go to **Settings → Budget Sync → History**
3. Verify latest sync shows "Success"
4. Check stats: Created, Updated, Errors

### 6.3 Verify Budget Data

1. Go to **Budgets** page
2. Verify departments and amounts match your FP&A tool
3. Test purchase request to verify budget checking works

---

## File Format Requirements

SpendFlo accepts CSV or Excel files with these columns:

**Required**:
- Department (e.g., "Engineering", "Sales")
- Budget Amount (numeric)
- Fiscal Period (e.g., "FY 2025", "Q1 2025")

**Optional**:
- Sub-category
- Currency (defaults to USD)

**Example CSV**:
```csv
Department,Sub Category,Fiscal Period,Budget Amount,Currency
Engineering,Software,FY 2025,500000,USD
Sales,Travel,FY 2025,75000,USD
```

---

## Monitoring & Alerts

### CloudWatch Alarms (Optional)

**Monitor Lambda failures**:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name spendflo-budget-sync-errors \
  --alarm-description "Alert if budget sync fails" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=FunctionName,Value=budget-export-to-s3 \
  --alarm-actions <sns-topic-arn>
```

**Monitor S3 uploads**:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name spendflo-no-budget-upload \
  --alarm-description "Alert if no file uploaded in 48 hours" \
  --metric-name NumberOfObjects \
  --namespace AWS/S3 \
  --statistic Average \
  --period 86400 \
  --threshold 1 \
  --comparison-operator LessThanThreshold
```

---

## Security Best Practices

### 1. Enable S3 Bucket Encryption
```bash
aws s3api put-bucket-encryption \
  --bucket your-company-budget-exports \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### 2. Enable Bucket Versioning
```bash
aws s3api put-bucket-versioning \
  --bucket your-company-budget-exports \
  --versioning-configuration Status=Enabled
```

### 3. Set Object Lifecycle Policy (Auto-delete old files)
```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket your-company-budget-exports \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "delete-old-budgets",
      "Status": "Enabled",
      "Prefix": "budgets/",
      "Expiration": {"Days": 30}
    }]
  }'
```

### 4. Enable CloudTrail Logging
```bash
aws cloudtrail create-trail \
  --name spendflo-budget-sync-trail \
  --s3-bucket-name your-audit-logs-bucket

aws cloudtrail start-logging --name spendflo-budget-sync-trail
```

---

## Troubleshooting

### Issue: "Access Denied" when SpendFlo tries to read bucket

**Fix**:
1. Verify IAM policy grants `s3:GetObject` and `s3:ListBucket`
2. Check bucket policy doesn't block SpendFlo's IP
3. Verify Access Key ID and Secret are correct

### Issue: "No files found" in sync

**Fix**:
1. Check files are in correct prefix (e.g., `budgets/`)
2. Verify file extension is `.csv` or `.xlsx`
3. Check file naming matches expected pattern

### Issue: Lambda timeout errors

**Fix**:
1. Increase Lambda timeout (default 3s → increase to 60s)
2. Optimize budget data query
3. Consider breaking into smaller batches

---

## Cost Estimation

**S3 Storage**: ~$0.023/GB/month
- 1 MB CSV file per day = 30 MB/month = $0.001/month

**S3 Requests**:
- GET requests: $0.0004 per 1,000 requests
- PUT requests: $0.005 per 1,000 requests
- Daily upload + SpendFlo polls 6x/day = ~200 requests/month = $0.001/month

**Lambda** (if used):
- Free tier: 1M requests/month
- Daily execution: 30 requests/month = FREE

**Total**: ~$0.01/month (negligible cost)

---

## FAQ

**Q: Can we use S3 in a different region?**
A: Yes! SpendFlo supports all AWS regions. Specify region in configuration.

**Q: Do we need to clean up old files?**
A: No. Set S3 lifecycle policy to auto-delete files after 30 days (see Security section).

**Q: Can SpendFlo write to our bucket?**
A: No. SpendFlo only needs read access for security.

**Q: What if our FP&A tool doesn't support S3?**
A: Export to local file, then use Lambda/script to upload to S3 (see Step 4).

**Q: Can we use Cross-Account S3 access?**
A: Yes! Use bucket policy to grant SpendFlo's AWS account read access.

---

## Support

- **Technical Issues**: engineering@spendflo.com
- **S3 Access Issues**: support@spendflo.com
- **Slack**: #budget-sync-support
