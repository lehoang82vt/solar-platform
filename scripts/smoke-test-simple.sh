#!/bin/bash
# SMOKE TEST: Complete Sales Flow

API="http://localhost:3000/api"
PASS=0
FAIL=0

test_endpoint() {
    local name=$1
    local method=$2
    local path=$3
    local data=$4
    local expected_status=$5

    if [ -z "$expected_status" ]; then
        expected_status="200"
    fi

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API$path" \
            -H "Content-Type: application/json")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API$path" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi

    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$status_code" = "$expected_status" ]; then
        echo "✓ $name (HTTP $status_code)"
        PASS=$((PASS + 1))
    else
        echo "✗ $name (Expected $expected_status, got $status_code)"
        FAIL=$((FAIL + 1))
    fi

    echo "$body"
}

echo "=== SMOKE TEST: Revenue-Critical Flow ==="
echo ""

# 1. Health Check
echo "1. Health Check"
test_endpoint "Health endpoint" "GET" "/health" "" "200"
echo ""

# 2. OTP Request (SECURITY CHECK - OTP should NOT be in response)
echo "2. OTP Request (Check: plaintext OTP NOT in response)"
otp_response=$(curl -s -X POST "$API/public/otp/request" \
    -H "Content-Type: application/json" \
    -d '{"phone":"+84987654321"}')

echo "OTP Response: $otp_response"

# Check that challenge_id exists
if echo "$otp_response" | grep -q "challenge_id"; then
    echo "✓ OTP Response contains challenge_id"
    PASS=$((PASS + 1))
else
    echo "✗ OTP Response missing challenge_id"
    FAIL=$((FAIL + 1))
fi

# Check that OTP is NOT in response (SECURITY FIX)
if echo "$otp_response" | grep -q '"otp"'; then
    echo "✗ SECURITY FAIL: OTP should NOT be in response body!"
    FAIL=$((FAIL + 1))
else
    echo "✓ SECURITY: OTP not exposed in response (PASS)"
    PASS=$((PASS + 1))
fi
echo ""

# 3. Login Test
echo "3. User Authentication"
test_endpoint "User Login" "POST" "/users/login" \
    '{"phone":"0961234567","password":"test"}' "200"
echo ""

# 4. Project Creation (requires auth token - skipping for simple test)
echo "4. Project Management"
test_endpoint "List Projects (no auth)" "GET" "/projects/v3?limit=10" "" "401"
echo ""

# 5. Quote Operations
echo "5. Quote Management"
test_endpoint "List Quotes (no auth)" "GET" "/quotes/v2?limit=10" "" "401"
echo ""

# 6. Contract Operations
echo "6. Contract Management"
test_endpoint "List Contracts (no auth)" "GET" "/projects/test-id/contracts" "" "401"
echo ""

echo "=== SMOKE TEST COMPLETE ==="
echo ""
echo "Results: $PASS PASSED, $FAIL FAILED"
echo ""

if [ $FAIL -gt 0 ]; then
    exit 1
else
    exit 0
fi
