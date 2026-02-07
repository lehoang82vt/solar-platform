# verify-contract-lifecycle-v1.ps1
# Contract lifecycle verification script
# FIXED: Use correct endpoint for quote creation

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = 'Stop'

Write-Host "=== Contract Lifecycle Verification ===" -ForegroundColor Cyan
Write-Host ""

# Login
Write-Host "=== Login ===" -ForegroundColor Yellow
$loginBody = '{"email":"admin@solar.local","password":"AdminPassword123"}'
$loginResp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = if ($loginResp.access_token) { $loginResp.access_token } elseif ($loginResp.token) { $loginResp.token } else { $loginResp.value.access_token }
Write-Host "TOKEN_SET"

$headers = @{Authorization="Bearer $token"; "Content-Type"="application/json"}

# Create customer
Write-Host "`n=== Setup: customer, project, quote, contract ===" -ForegroundColor Yellow
$custBody = '{"name":"Verify Customer","phone":"0900000999","email":"verify@test.com","address":"HCM"}'
$custResp = Invoke-RestMethod -Uri "$BaseUrl/api/customers" -Method POST -Headers $headers -Body $custBody
$customerId = if ($custResp.id) { $custResp.id } else { $custResp.value.id }
Write-Host "customer_id=$customerId"

# Create project
Write-Host "=== Create project (must include customer_id) ===" -ForegroundColor Yellow
$projBody = "{`"customer_id`":`"$customerId`",`"name`":`"Verify Project`",`"address`":`"Q1, HCM`"}"
$projResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects" -Method POST -Headers $headers -Body $projBody
$projectId = if ($projResp.id) { $projResp.id } else { $projResp.value.id }
$projCustId = if ($projResp.customer_id) { $projResp.customer_id } else { $projResp.value.customer_id }
Write-Host "project_id=$projectId"
if ($projCustId -eq $customerId) { Write-Host "project.customer_id OK" -ForegroundColor Green }

# Create quote - FIXED: Use project endpoint
$quoteBody = '{"title":"Verify Quote"}'
$quoteResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/quotes" -Method POST -Headers $headers -Body $quoteBody
$quoteId = if ($quoteResp.id) { $quoteResp.id } else { $quoteResp.value.id }
Write-Host "quote_id=$quoteId (POST /api/projects/:projectId/quotes)"

# Update quote payload
$payloadBody = '{"payload":{"project_id":"' + $projectId + '","price_total":150000000}}'
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quoteId/payload" -Method PATCH -Headers $headers -Body $payloadBody | Out-Null

# Approve quote
$statusBody = '{"status":"accepted"}'
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quoteId/status" -Method PATCH -Headers $headers -Body $statusBody | Out-Null
Write-Host "quote_id=$quoteId status=accepted (APPROVED)"

# Create contract
$contractBody = "{`"quote_id`":`"$quoteId`",`"payment_terms`":[{`"milestone`":`"Full`",`"pct`":100}]}"
$contractResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/contracts" -Method POST -Headers $headers -Body $contractBody
$contractId = if ($contractResp.id) { $contractResp.id } else { $contractResp.value.id }
# helper to assert HTTP 200
function Invoke-AssertSuccess([string]$label, [string]$method, [string]$uri, [string]$body = $null) {
    $args = @{ Uri = $uri; Method = $method; Headers = $headers; UseBasicParsing = $true }
    if ($body) {
        $args['Body'] = $body
        $args['ContentType'] = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest @args
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        $description = $_.Exception.Response.StatusDescription
        Write-Host "$label FAILED: HTTP $status $description" -ForegroundColor Red
        exit 1
    }
    if ($resp.StatusCode -ne 200) {
        Write-Host "$label FAILED: HTTP $($resp.StatusCode)" -ForegroundColor Red
        exit 1
    }
    Write-Host "${label}: 200"
    return $resp
}

# Step 1: Valid transitions DRAFT -> SIGNED -> INSTALLING -> HANDOVER -> COMPLETED
Write-Host "`n=== Step 1: Valid transitions DRAFT -> SIGNED -> INSTALLING -> HANDOVER -> COMPLETED ===" -ForegroundColor Yellow

Invoke-AssertSuccess 'DRAFT -> SIGNED' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/sign"
Invoke-AssertSuccess 'SIGNED -> INSTALLING' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/transition" '{"to_status":"INSTALLING"}'
Invoke-AssertSuccess 'INSTALLING -> HANDOVER' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/transition" '{"to_status":"HANDOVER"}'
Invoke-AssertSuccess 'HANDOVER -> COMPLETED' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/transition" '{"to_status":"COMPLETED"}'

Write-Host "Step 1 PASS: all transitions in order accepted" -ForegroundColor Green

# Step 2: Wrong-order transition
Write-Host "`n=== Step 2: Wrong-order transition rejected ===" -ForegroundColor Yellow

# Create new contract for step 2
$quote2Body = '{"title":"Verify Quote2"}'
$quote2Resp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/quotes" -Method POST -Headers $headers -Body $quote2Body
$quote2Id = if ($quote2Resp.id) { $quote2Resp.id } else { $quote2Resp.value.id }

$payload2 = '{"payload":{"project_id":"' + $projectId + '","price_total":100000000}}'
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quote2Id/payload" -Method PATCH -Headers $headers -Body $payload2 | Out-Null
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quote2Id/status" -Method PATCH -Headers $headers -Body '{"status":"accepted"}' | Out-Null

$contract2Body = "{`"quote_id`":`"$quote2Id`",`"payment_terms`":[{`"milestone`":`"Full`",`"pct`":100}]}"
$contract2Resp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/contracts" -Method POST -Headers $headers -Body $contract2Body
$contract2Id = if ($contract2Resp.id) { $contract2Resp.id } else { $contract2Resp.value.id }

$wrongOrderFailed = $false
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/contracts/$contract2Id/transition" -Method POST -Headers $headers -Body '{"to_status":"COMPLETED"}' | Out-Null
}
catch {
    $wrongOrderFailed = $true
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "DRAFT -> COMPLETED rejected: $statusCode (expected 400/409)"
}

if ($wrongOrderFailed) {
    Write-Host "Step 2 PASS: wrong-order rejected" -ForegroundColor Green
}
else {
    Write-Host "Step 2 FAIL: wrong-order accepted" -ForegroundColor Red
    exit 1
}

# Step 3: PATCH when SIGNED
Write-Host "`n=== Step 3: PATCH when SIGNED rejected ===" -ForegroundColor Yellow

# Create new contract for step 3
$quote3Body = '{"title":"Verify Quote3"}'
$quote3Resp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/quotes" -Method POST -Headers $headers -Body $quote3Body
$quote3Id = if ($quote3Resp.id) { $quote3Resp.id } else { $quote3Resp.value.id }

$payload3 = '{"payload":{"project_id":"' + $projectId + '","price_total":120000000}}'
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quote3Id/payload" -Method PATCH -Headers $headers -Body $payload3 | Out-Null
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quote3Id/status" -Method PATCH -Headers $headers -Body '{"status":"accepted"}' | Out-Null

$contract3Body = "{`"quote_id`":`"$quote3Id`",`"payment_terms`":[{`"milestone`":`"Full`",`"pct`":100}]}"
$contract3Resp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/contracts" -Method POST -Headers $headers -Body $contract3Body
$contract3Id = if ($contract3Resp.id) { $contract3Resp.id } else { $contract3Resp.value.id }

# Transition to SIGNED
Invoke-AssertSuccess 'DRAFT -> SIGNED for PATCH check' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contract3Id/sign"

# Try PATCH when SIGNED
$patchFailed = $false
$patchStatusCode = 0

try {
    Invoke-WebRequest -Uri "$BaseUrl/api/projects/$projectId/contracts/$contract3Id" -Method PATCH -Headers $headers -Body '{"warranty_terms":"any"}' -UseBasicParsing | Out-Null
}
catch {
    $patchFailed = $true
    $patchStatusCode = $_.Exception.Response.StatusCode.value__
}

if ($patchFailed -and $patchStatusCode -eq 409) {
    Write-Host "Step 3 PASS: PATCH when SIGNED returns 409 (locked)" -ForegroundColor Green
}
else {
    Write-Host "FAIL: PATCH when SIGNED must be 409, got $patchStatusCode" -ForegroundColor Red
    exit 1
}

# All tests passed
Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
Write-Host "EXITCODE=0"
exit 0