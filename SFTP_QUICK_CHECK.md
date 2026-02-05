# SFTP Quick Check Guide

## Quick SFTP Connectivity Test

### Method 1: Using sftp Command (Built-in)

```bash
# Basic connection test
sftp username@hostname

# Example with specific port
sftp -P 2222 username@hostname

# Test with password authentication
sftp username@sftp.example.com
# Enter password when prompted

# Test with key-based authentication
sftp -i ~/.ssh/id_rsa username@sftp.example.com
```

### Method 2: Using curl (Quick Test)

```bash
# List files in directory
curl -u username:password sftp://hostname/path/

# Download a file
curl -u username:password sftp://hostname/path/file.csv -o /tmp/file.csv

# Upload a file
curl -T /path/to/local/file.csv -u username:password sftp://hostname/remote/path/
```

### Method 3: Using lftp (Advanced)

```bash
# Install lftp if not available
brew install lftp  # macOS
# sudo apt-get install lftp  # Ubuntu/Debian

# Connect and test
lftp sftp://username:password@hostname
# Once connected:
ls          # List files
pwd         # Current directory
get file    # Download file
put file    # Upload file
bye         # Exit
```

### Method 4: Test with Node.js Script

Create a test script `test-sftp.js`:

```javascript
const Client = require('ssh2-sftp-client');

async function testSFTP() {
  const sftp = new Client();

  try {
    await sftp.connect({
      host: 'your-sftp-host',
      port: 22,
      username: 'your-username',
      password: 'your-password',
      // OR use private key:
      // privateKey: require('fs').readFileSync('/path/to/private/key')
    });

    console.log('✓ Connected successfully!');

    // Test list files
    const list = await sftp.list('/');
    console.log('✓ Files in root:', list.length);

    // Test read/write
    await sftp.put(Buffer.from('test'), '/test-file.txt');
    console.log('✓ Upload test successful');

    await sftp.delete('/test-file.txt');
    console.log('✓ Delete test successful');

  } catch (err) {
    console.error('✗ SFTP Error:', err.message);
  } finally {
    await sftp.end();
  }
}

testSFTP();
```

Run it:
```bash
npm install ssh2-sftp-client
node test-sftp.js
```

---

## Testing SFTP with Budget Import System

### Step 1: Create SFTP Config

```bash
curl -X POST http://localhost:3000/api/sync/create-config \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "YOUR_CUSTOMER_ID",
    "sourceType": "sftp",
    "config": {
      "host": "sftp.example.com",
      "port": 22,
      "username": "budget_user",
      "password": "your_password",
      "remotePath": "/budgets/",
      "filePattern": "*.csv"
    },
    "schedule": "0 2 * * *"
  }'
```

### Step 2: Test Manual Sync

```bash
# Get sync config ID from previous step
SYNC_CONFIG_ID="config_123"

# Trigger manual sync
curl -X POST http://localhost:3000/api/sync/trigger \
  -H "Content-Type: application/json" \
  -d "{
    \"syncConfigId\": \"$SYNC_CONFIG_ID\"
  }"
```

### Step 3: Check Results

```bash
# View import history
curl "http://localhost:3000/api/imports/history?customerId=YOUR_CUSTOMER_ID"

# View imported budgets
curl "http://localhost:3000/api/budgets?customerId=YOUR_CUSTOMER_ID&source=sftp"
```

---

## Common SFTP Issues & Fixes

### Issue: "Connection refused"
**Causes:**
- Wrong host/port
- Firewall blocking connection
- SFTP server not running

**Fix:**
```bash
# Check if host is reachable
ping sftp.example.com

# Check if port is open
telnet sftp.example.com 22
# OR
nc -zv sftp.example.com 22
```

### Issue: "Authentication failed"
**Causes:**
- Wrong username/password
- Key-based auth required but not configured
- Account locked/disabled

**Fix:**
```bash
# Test with verbose output
sftp -vvv username@hostname
# This will show detailed authentication attempts
```

### Issue: "Permission denied"
**Causes:**
- No read permission on remote directory
- No write permission (if uploading)

**Fix:**
```bash
# Check permissions
sftp username@hostname
ls -la /path/to/directory
```

### Issue: "Host key verification failed"
**Causes:**
- Host key changed (security warning)
- First time connecting

**Fix:**
```bash
# Add host key to known_hosts
ssh-keyscan hostname >> ~/.ssh/known_hosts

# OR connect once manually to accept key
sftp username@hostname
# Type "yes" when prompted
```

---

## Quick SFTP Health Check Script

Save as `check-sftp.sh`:

```bash
#!/bin/bash

# Configuration
SFTP_HOST="sftp.example.com"
SFTP_PORT="22"
SFTP_USER="username"
SFTP_PASS="password"
SFTP_PATH="/budgets/"

echo "=== SFTP Health Check ==="
echo "Host: $SFTP_HOST:$SFTP_PORT"
echo "User: $SFTP_USER"
echo ""

# Test 1: Host reachable
echo "Test 1: Checking if host is reachable..."
if ping -c 1 -W 2 $SFTP_HOST > /dev/null 2>&1; then
  echo "✓ Host is reachable"
else
  echo "✗ Host is not reachable"
  exit 1
fi

# Test 2: Port open
echo ""
echo "Test 2: Checking if SFTP port is open..."
if nc -zv $SFTP_HOST $SFTP_PORT 2>&1 | grep -q succeeded; then
  echo "✓ Port $SFTP_PORT is open"
else
  echo "✗ Port $SFTP_PORT is not accessible"
  exit 1
fi

# Test 3: Authentication
echo ""
echo "Test 3: Testing authentication..."
lftp -c "open sftp://$SFTP_USER:$SFTP_PASS@$SFTP_HOST && ls $SFTP_PATH && bye" > /tmp/sftp-test.log 2>&1

if [ $? -eq 0 ]; then
  echo "✓ Authentication successful"
else
  echo "✗ Authentication failed"
  cat /tmp/sftp-test.log
  exit 1
fi

# Test 4: Read access
echo ""
echo "Test 4: Checking read access..."
FILE_COUNT=$(lftp -c "open sftp://$SFTP_USER:$SFTP_PASS@$SFTP_HOST && cls $SFTP_PATH && bye" 2>/dev/null | wc -l)
echo "✓ Found $FILE_COUNT files in $SFTP_PATH"

# Test 5: Write access (optional)
echo ""
echo "Test 5: Checking write access..."
TEST_FILE=".test-write-$(date +%s).txt"
echo "test" | lftp -c "open sftp://$SFTP_USER:$SFTP_PASS@$SFTP_HOST && put /dev/stdin -o $SFTP_PATH$TEST_FILE && rm $SFTP_PATH$TEST_FILE && bye" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✓ Write access confirmed"
else
  echo "⚠ Write access denied (read-only access)"
fi

echo ""
echo "=== All Tests Passed! ==="
```

Make it executable and run:
```bash
chmod +x check-sftp.sh
./check-sftp.sh
```

---

## Testing SFTP in Budget System

### 1. Set up test SFTP server (Docker)

```bash
# Quick SFTP server for testing
docker run -p 2222:22 \
  -e SFTP_USERS='testuser:testpass:1001' \
  -v /tmp/sftp-data:/home/testuser/upload \
  atmoz/sftp

# Now you can test with:
# Host: localhost
# Port: 2222
# Username: testuser
# Password: testpass
```

### 2. Upload test budget file

```bash
# Upload to test server
sftp -P 2222 testuser@localhost <<EOF
put test-data/1_standard_format.csv upload/budget.csv
bye
EOF
```

### 3. Configure system to sync from SFTP

```bash
curl -X POST http://localhost:3000/api/sync/create-config \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "YOUR_CUSTOMER_ID",
    "sourceType": "sftp",
    "config": {
      "host": "localhost",
      "port": 2222,
      "username": "testuser",
      "password": "testpass",
      "remotePath": "/upload/",
      "filePattern": "*.csv"
    },
    "schedule": "*/5 * * * *"
  }'
```

### 4. Trigger sync and verify

```bash
# Trigger sync
curl -X POST http://localhost:3000/api/sync/trigger \
  -H "Content-Type: application/json" \
  -d '{"syncConfigId": "YOUR_CONFIG_ID"}'

# Check results
curl "http://localhost:3000/api/budgets?customerId=YOUR_CUSTOMER_ID&source=sftp"
```

---

## Troubleshooting Checklist

- [ ] Host is reachable (ping test)
- [ ] Port is open (telnet/nc test)
- [ ] Credentials are correct
- [ ] User has read access to directory
- [ ] File pattern matches existing files
- [ ] Files are not empty
- [ ] Files are valid budget format (not payroll/expenses)
- [ ] Network allows SFTP traffic
- [ ] Host key is in known_hosts
- [ ] SSH keys have correct permissions (600)

---

## Production SFTP Best Practices

1. **Use SSH Keys Instead of Passwords**
   ```bash
   # Generate key pair
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/sftp_key

   # Copy public key to server
   ssh-copy-id -i ~/.ssh/sftp_key.pub username@sftp-server

   # Test
   sftp -i ~/.ssh/sftp_key username@sftp-server
   ```

2. **Use Dedicated SFTP User**
   - Create user with limited permissions
   - Restrict to specific directory
   - Read-only access if possible

3. **Enable Connection Pooling**
   - Reuse connections for multiple operations
   - Set connection timeout

4. **Monitor Failed Connections**
   - Log all connection attempts
   - Alert on repeated failures
   - Track file sync success/failure rates

5. **Secure Credentials**
   - Use environment variables
   - Never commit credentials to git
   - Rotate passwords regularly
   - Store in secrets management system (Vault, AWS Secrets Manager)

---

## Summary

Quick test command (replace values):
```bash
sftp -P 22 username@hostname <<EOF
ls /remote/path/
bye
EOF
```

If that works, your SFTP is ready for budget imports!
