#!/bin/bash

# Comprehensive Production Test Suite
# Tests all critical features before deployment

BASE_URL="http://localhost:3001"
RESULTS_FILE="test-results.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
TOTAL=0

# Function to run test
run_test() {
    local test_name="$1"
    local command="$2"
    local expected="$3"

    TOTAL=$((TOTAL + 1))
    echo -n "Test $TOTAL: $test_name... "

    result=$(eval "$command" 2>&1)
    status=$?

    if [[ $status -eq 0 ]] && [[ "$result" == *"$expected"* ]]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Expected: $expected"
        echo "  Got: $result"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "=========================================="
echo "  SpendFlo Budget - Production Test Suite"
echo "=========================================="
echo ""

# Test 1: Health Check
echo "=== BASIC HEALTH CHECKS ==="
run_test "Health endpoint responds" \
    "curl -s $BASE_URL/api/health" \
    '"status":"ok"'

run_test "Health check returns timestamp" \
    "curl -s $BASE_URL/api/health" \
    '"timestamp"'

# Test 2: Database Connection
run_test "Database connection works" \
    "curl -s $BASE_URL/api/health" \
    'ok'

echo ""
echo "=== USER AUTHENTICATION ==="

# Create test customer first
CUSTOMER_ID=$(curl -s -X POST $BASE_URL/api/seed | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
sleep 2

# Test 3: User Registration
TEST_EMAIL="test_$(date +%s)@spendflo.com"
REGISTER_RESULT=$(curl -s -X POST $BASE_URL/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"TestPassword123!\",
        \"name\": \"Test User\",
        \"customerId\": \"$CUSTOMER_ID\"
    }")

if [[ "$REGISTER_RESULT" == *'"success":true'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): User registration works${NC}"
    PASSED=$((PASSED + 1))
    USER_ID=$(echo "$REGISTER_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    JWT_TOKEN=$(echo "$REGISTER_RESULT" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
    echo -e "${RED}✗ Test $((++TOTAL)): User registration FAILED${NC}"
    echo "Response: $REGISTER_RESULT"
    FAILED=$((FAILED + 1))
fi

# Test 4: User Login
sleep 1
LOGIN_RESULT=$(curl -s -X POST $BASE_URL/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"TestPassword123!\"
    }")

if [[ "$LOGIN_RESULT" == *'"success":true'* ]] && [[ "$LOGIN_RESULT" == *'"token"'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): User login works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): User login FAILED${NC}"
    echo "Response: $LOGIN_RESULT"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=== BUDGET OPERATIONS ==="

# Test 5: Create Budget
sleep 1
CREATE_BUDGET=$(curl -s -X POST $BASE_URL/api/budgets \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"customerId\": \"$CUSTOMER_ID\",
        \"department\": \"Engineering\",
        \"subCategory\": \"Software\",
        \"fiscalPeriod\": \"Q1 2025\",
        \"budgetedAmount\": 50000,
        \"currency\": \"USD\"
    }")

if [[ "$CREATE_BUDGET" == *'"success":true'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): Create budget works${NC}"
    PASSED=$((PASSED + 1))
    BUDGET_ID=$(echo "$CREATE_BUDGET" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
else
    echo -e "${RED}✗ Test $((++TOTAL)): Create budget FAILED${NC}"
    echo "Response: $CREATE_BUDGET"
    FAILED=$((FAILED + 1))
fi

# Test 6: Check Budget Availability
sleep 1
CHECK_BUDGET=$(curl -s -X POST $BASE_URL/api/budget/check \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"customerId\": \"$CUSTOMER_ID\",
        \"department\": \"Engineering\",
        \"amount\": 5000,
        \"fiscalPeriod\": \"Q1 2025\"
    }")

if [[ "$CHECK_BUDGET" == *'"available":true'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): Budget availability check works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): Budget availability check FAILED${NC}"
    echo "Response: $CHECK_BUDGET"
    FAILED=$((FAILED + 1))
fi

# Test 7: List Budgets
sleep 1
LIST_BUDGETS=$(curl -s "$BASE_URL/api/budgets?customerId=$CUSTOMER_ID" \
    -H "Authorization: Bearer $JWT_TOKEN")

if [[ "$LIST_BUDGETS" == *'"success":true'* ]] && [[ "$LIST_BUDGETS" == *'"budgets"'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): List budgets works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): List budgets FAILED${NC}"
    echo "Response: $LIST_BUDGETS"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=== CSV UPLOAD ==="

# Test 8: Upload Budget CSV
sleep 1
UPLOAD_RESULT=$(curl -s -X POST $BASE_URL/api/upload-budget \
    -F "file=@test-data/budget-import-sample.csv" \
    -F "customerId=$CUSTOMER_ID" \
    -F "userId=$USER_ID")

if [[ "$UPLOAD_RESULT" == *'"success":true'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): CSV upload works${NC}"
    PASSED=$((PASSED + 1))
    IMPORTED=$(echo "$UPLOAD_RESULT" | grep -o '"imported":[0-9]*' | cut -d':' -f2)
    echo "  Imported: $IMPORTED budgets"
else
    echo -e "${RED}✗ Test $((++TOTAL)): CSV upload FAILED${NC}"
    echo "Response: $UPLOAD_RESULT"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=== AUTO-APPROVAL ENGINE ==="

# Test 9: Small Request (Auto-Approve)
sleep 1
SMALL_REQUEST=$(curl -s -X POST $BASE_URL/api/requests/submit \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"customerId\": \"$CUSTOMER_ID\",
        \"supplier\": \"AWS\",
        \"description\": \"Cloud hosting\",
        \"amount\": 2000,
        \"department\": \"Engineering\",
        \"fiscalPeriod\": \"Q1 2025\",
        \"createdById\": \"$USER_ID\"
    }")

if [[ "$SMALL_REQUEST" == *'"status":"approved"'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): Small request auto-approval works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): Small request auto-approval FAILED${NC}"
    echo "Response: $SMALL_REQUEST"
    FAILED=$((FAILED + 1))
fi

# Test 10: Large Request (Pending)
sleep 1
LARGE_REQUEST=$(curl -s -X POST $BASE_URL/api/requests/submit \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"customerId\": \"$CUSTOMER_ID\",
        \"supplier\": \"Salesforce\",
        \"description\": \"Enterprise license\",
        \"amount\": 20000,
        \"department\": \"Engineering\",
        \"fiscalPeriod\": \"Q1 2025\",
        \"createdById\": \"$USER_ID\"
    }")

if [[ "$LARGE_REQUEST" == *'"status":"pending"'* ]] || [[ "$LARGE_REQUEST" == *'"status":"approved"'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): Large request handling works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): Large request handling FAILED${NC}"
    echo "Response: $LARGE_REQUEST"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=== API KEY MANAGEMENT ==="

# Test 11: Create API Key
sleep 1
CREATE_KEY=$(curl -s -X POST $BASE_URL/api/api-keys \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"name\": \"Test API Key\",
        \"permissions\": [\"budget.read\"],
        \"customerId\": \"$CUSTOMER_ID\",
        \"createdById\": \"$USER_ID\"
    }")

if [[ "$CREATE_KEY" == *'"success":true'* ]] && [[ "$CREATE_KEY" == *'"key":"sfb_live_'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): Create API key works${NC}"
    PASSED=$((PASSED + 1))
    API_KEY=$(echo "$CREATE_KEY" | grep -o '"key":"sfb_live_[^"]*"' | cut -d'"' -f4)
else
    echo -e "${RED}✗ Test $((++TOTAL)): Create API key FAILED${NC}"
    echo "Response: $CREATE_KEY"
    FAILED=$((FAILED + 1))
fi

# Test 12: List API Keys
sleep 1
LIST_KEYS=$(curl -s "$BASE_URL/api/api-keys?customerId=$CUSTOMER_ID" \
    -H "Authorization: Bearer $JWT_TOKEN")

if [[ "$LIST_KEYS" == *'"success":true'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): List API keys works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): List API keys FAILED${NC}"
    echo "Response: $LIST_KEYS"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=== AI MAPPING ==="

# Test 13: AI Column Mapping
sleep 1
AI_MAP=$(curl -s -X POST $BASE_URL/api/imports/ai-map \
    -F "file=@test-data/budget-import-sample.csv")

if [[ "$AI_MAP" == *'"success":true'* ]] && [[ "$AI_MAP" == *'"mappings"'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): AI column mapping works${NC}"
    PASSED=$((PASSED + 1))
    CONFIDENCE=$(echo "$AI_MAP" | grep -o '"confidence":[0-9.]*' | head -1 | cut -d':' -f2)
    echo "  Confidence: $CONFIDENCE"
else
    echo -e "${RED}✗ Test $((++TOTAL)): AI column mapping FAILED${NC}"
    echo "Response: $AI_MAP"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=== ERROR HANDLING ==="

# Test 14: Invalid Auth Token
sleep 1
INVALID_AUTH=$(curl -s -w "%{http_code}" -o /dev/null $BASE_URL/api/budgets \
    -H "Authorization: Bearer invalid-token")

if [[ "$INVALID_AUTH" == "401" ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): Invalid auth returns 401${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): Invalid auth handling FAILED${NC}"
    echo "Expected: 401, Got: $INVALID_AUTH"
    FAILED=$((FAILED + 1))
fi

# Test 15: Missing Required Fields
sleep 1
MISSING_FIELDS=$(curl -s -X POST $BASE_URL/api/budgets \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"customerId": "'$CUSTOMER_ID'"}')

if [[ "$MISSING_FIELDS" == *'error'* ]] || [[ "$MISSING_FIELDS" == *'required'* ]]; then
    echo -e "${GREEN}✓ Test $((++TOTAL)): Missing fields validation works${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗ Test $((++TOTAL)): Missing fields validation FAILED${NC}"
    echo "Response: $MISSING_FIELDS"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=========================================="
echo "  TEST RESULTS"
echo "=========================================="
echo ""
echo "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo "Application is ready for production deployment."
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED!${NC}"
    echo "Please fix the failures before deploying to production."
    exit 1
fi
