#!/usr/bin/env pwsh
#Requires -Version 7

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$API_URL = "http://localhost:3000/api"
$ADMIN_EMAIL = "admin@solar.local"
$ADMIN_PASSWORD = "AdminPassword123"

Write-Host "=== QUOTE APPROVAL VERIFY ===" -ForegroundColor Cyan
Write-Host ""

function Invoke-ApiCall {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Token = $null,
        [object]$Body = $null
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }
    
    $params = @{
        Method = $Method
        Uri = "$API_URL$Endpoint"
        Headers = $headers
    }
    
    if ($Body) {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Host "FAIL_API_CALL: $_" -ForegroundColor Red
        exit 1
    }
}

# Step 1: Login
Write-Host "[1/6] Login admin..." -ForegroundColor Yellow
$loginResult = Invoke-ApiCall -Method POST -Endpoint "/auth/login" -Body @{
    email = $ADMIN_EMAIL
    password = $ADMIN_PASSWORD
}

if (-not $loginResult.access_token) {
    Write-Host "FAIL_LOGIN" -ForegroundColor Red
    exit 1
}

$TOKEN = $loginResult.access_token
Write-Host "✓ Login success" -ForegroundColor Green

# Step 2: Create project
Write-Host "[2/6] Create project..." -ForegroundColor Yellow
$projectResult = Invoke-ApiCall -Method POST -Endpoint "/projects" -Token $TOKEN -Body @{
    customer_name = "Approval Test Customer"
    phone = "0901234567"
    site_address = "123 Test St"
    roof_area = 100
}

if (-not $projectResult.value.id) {
    Write-Host "FAIL_CREATE_PROJECT" -ForegroundColor Red
    exit 1
}

$PROJECT_ID = $projectResult.value.id
Write-Host "✓ Project ID: $PROJECT_ID" -ForegroundColor Green

# Step 3: Create quote
Write-Host "[3/6] Create quote..." -ForegroundColor Yellow
$quoteResult = Invoke-ApiCall -Method POST -Endpoint "/quotes" -Token $TOKEN -Body @{
    project_id = $PROJECT_ID
    system_size = 5.0
    panel_type = "mono"
    price_total = 150000000
}

if (-not $quoteResult.value.id) {
    Write-Host "FAIL_CREATE_QUOTE" -ForegroundColor Red
    exit 1
}

$QUOTE_ID = $quoteResult.value.id
Write-Host "✓ Quote ID: $QUOTE_ID" -ForegroundColor Green

# Step 4: Check pending list
Write-Host "[4/6] Check pending list..." -ForegroundColor Yellow
$pendingResult = Invoke-ApiCall -Method GET -Endpoint "/quotes/pending" -Token $TOKEN

$found = $false
foreach ($q in $pendingResult.value) {
    if ($q.id -eq $QUOTE_ID) {
        $found = $true
        break
    }
}

if (-not $found) {
    Write-Host "FAIL_PENDING_LIST" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Quote found in pending list" -ForegroundColor Green

# Step 5: Approve quote
Write-Host "[5/6] Approve quote..." -ForegroundColor Yellow
$approveResult = Invoke-ApiCall -Method POST -Endpoint "/quotes/$QUOTE_ID/approve" -Token $TOKEN

if ($approveResult.value.status -ne "approved") {
    Write-Host "FAIL_APPROVE_STATUS" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Quote approved" -ForegroundColor Green

# Step 6: Verify database
Write-Host "[6/6] Verify database..." -ForegroundColor Yellow

# Check quote status and approved_at
$statusQuery = "SELECT status, approved_at FROM quotes WHERE id = '$QUOTE_ID'"
$statusResult = docker compose exec -T postgres psql -U postgres -d solargpt -t -c $statusQuery 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL_DB_CONNECTION" -ForegroundColor Red
    exit 1
}

if ($statusResult -notmatch "approved") {
    Write-Host "FAIL_DB_STATUS" -ForegroundColor Red
    exit 1
}

if ($statusResult -match "\|\s*\|") {
    Write-Host "FAIL_DB_APPROVED_AT_NULL" -ForegroundColor Red
    exit 1
}

Write-Host "✓ DB: status=approved, approved_at NOT NULL" -ForegroundColor Green

# Check audit event
$auditQuery = "SELECT COUNT(*) FROM audit_events WHERE entity = 'quote' AND action = 'approve' AND entity_id = '$QUOTE_ID'"
$auditResult = docker compose exec -T postgres psql -U postgres -d solargpt -t -c $auditQuery 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL_DB_AUDIT_QUERY" -ForegroundColor Red
    exit 1
}

$auditCount = [int]($auditResult.Trim())
if ($auditCount -lt 1) {
    Write-Host "FAIL_DB_AUDIT_COUNT" -ForegroundColor Red
    exit 1
}

Write-Host "✓ DB: audit_events recorded" -ForegroundColor Green

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "APPROVAL_VERIFY_PASS" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

exit 0