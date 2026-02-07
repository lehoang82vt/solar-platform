# verify-contract-sync-v1.ps1
# Contract ↔ Project sync + audit completeness verification (Phase 4 readiness)

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$DbName = if ($env:DbName) { $env:DbName } else { 'solar' }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = Resolve-Path (Join-Path $ScriptDir '..\..')
$DockerComposeFile = Join-Path $WorkspaceRoot 'docker-compose.yml'

function Fail([string]$message) {
    Write-Host "FAIL: $message" -ForegroundColor Red
    exit 1
}

function Pass([string]$message) {
    Write-Host "PASS: $message" -ForegroundColor Green
}

function Invoke-AssertSuccess([string]$label, [string]$method, [string]$uri, [string]$body = $null) {
    $args = @{ Uri = $uri; Method = $method; Headers = $headers; UseBasicParsing = $true }
    if ($body) {
        $args['Body'] = $body
        $args['ContentType'] = 'application/json'
    }
    try {
        $resp = Invoke-WebRequest @args
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $description = $_.Exception.Response.StatusDescription
        Fail("$label FAILED: HTTP $status $description")
    }
    if ($resp.StatusCode -ne 200) {
        Fail("$label FAILED: HTTP $($resp.StatusCode)")
    }
    Pass("$label returned 200")
    return $resp
}

function Run-Sql([string]$sql) {
    $cmd = @(
        'docker',
        'compose',
        '-f',
        $DockerComposeFile,
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'postgres',
        '-d',
        $DbName,
        '-tAc',
        $sql
    )
    $output = & $cmd
    if ($null -eq $output) {
        return ''
    }
    return $output.Trim()
}

Write-Host "=== Contract ↔ Project Sync Verification (F-28 Phase 4) ===" -ForegroundColor Cyan

# Login
Write-Host "=== Login ===" -ForegroundColor Yellow
$loginBody = '{"email":"admin@solar.local","password":"AdminPassword123"}'
$loginResp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = if ($loginResp.access_token) { $loginResp.access_token } elseif ($loginResp.token) { $loginResp.token } else { $loginResp.value.access_token }
if (-not $token) { Fail('Unable to obtain auth token') }
Write-Host "TOKEN_SET"

$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

Write-Host "`n=== Setup: customer, project, quote, contract draft ===" -ForegroundColor Yellow
$custBody = '{"name":"Sync Verify","phone":"0900000888","email":"sync@test.com","address":"HCM"}'
$custResp = Invoke-RestMethod -Uri "$BaseUrl/api/customers" -Method POST -Headers $headers -Body $custBody -UseBasicParsing
$customerId = if ($custResp.id) { $custResp.id } else { $custResp.value.id }
if (-not $customerId) { Fail('Customer creation failed') }

$projBody = @{ customer_id = $customerId; name = 'Sync Project'; address = 'Q2, HCM' } | ConvertTo-Json -Depth 3
$projResp = Invoke-RestMethod -Uri ($BaseUrl + '/api/projects') -Method POST -Headers $headers -Body $projBody -UseBasicParsing
$projectId = if ($projResp.id) { $projResp.id } else { $projResp.value.id }
if (-not $projectId) { Fail('Project creation failed') }

$quoteBody = '{"title":"Sync Quote"}'
$quoteResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/quotes" -Method POST -Headers $headers -Body $quoteBody -UseBasicParsing
$quoteId = if ($quoteResp.id) { $quoteResp.id } else { $quoteResp.value.id }
if (-not $quoteId) { Fail('Quote creation failed') }

$payloadBody = '{"payload":{"project_id":"' + $projectId + '","price_total":135000000}}'
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quoteId/payload" -Method PATCH -Headers $headers -Body $payloadBody -UseBasicParsing | Out-Null

$statusBody = '{"status":"accepted"}'
Invoke-RestMethod -Uri "$BaseUrl/api/quotes/$quoteId/status" -Method PATCH -Headers $headers -Body $statusBody -UseBasicParsing | Out-Null

$contractBody = @{ quote_id = $quoteId; payment_terms = @(@{ milestone = 'Full'; pct = 100 }) } | ConvertTo-Json -Depth 4
$contractResp = Invoke-RestMethod -Uri ($BaseUrl + '/api/projects/' + $projectId + '/contracts') -Method POST -Headers $headers -Body $contractBody -UseBasicParsing
$contractId = if ($contractResp.id) { $contractResp.id } else { $contractResp.value.id }
if (-not $contractId) { Fail('Contract creation failed') }

Write-Host "contract_id=$contractId" -ForegroundColor Gray

Write-Host "`n=== Negative: skip transition DRAFT -> INSTALLING ===" -ForegroundColor Yellow
$negativeFailed = $false
try {
    Invoke-WebRequest -Uri "$BaseUrl/api/projects/$projectId/contracts/$contractId/transition" -Method POST -Headers $headers -Body '{"to_status":"INSTALLING"}' -UseBasicParsing | Out-Null
} catch {
    $negativeFailed = $true
    $status = $_.Exception.Response.StatusCode.value__
    $reason = $_.Exception.Response.StatusDescription
    if ($status -in 400, 409) {
        Pass("DRAFT -> INSTALLING rejected as expected (HTTP $status $reason)")
    } else {
        Fail("Unexpected HTTP $status for skipped transition: $reason")
    }
}
if (-not $negativeFailed) {
    Fail('DRAFT -> INSTALLING must reject when contract is still DRAFT')
}

Write-Host "`n=== Step 1: transition DRAFT -> SIGNED ===" -ForegroundColor Yellow
Invoke-AssertSuccess 'Sign contract' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/sign"

$contractDetail = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/contracts/$contractId" -Headers $headers -Method GET -UseBasicParsing
if (($contractDetail.status -as [string]).ToUpper() -ne 'SIGNED') {
    Fail('Contract status did not become SIGNED after signing')
}
Pass('Contract status is SIGNED')

$projectDetail = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId" -Headers $headers -Method GET -UseBasicParsing
$projectStatus = ($projectDetail.value.status -as [string]).ToUpper()
if ($projectStatus -ne 'CONTRACTED') {
    Fail("Project status expected CONTRACTED, got $projectStatus")
}
Pass('Project status is CONTRACTED after signing')

$contractAudit = Run-Sql("select count(*) from audit_logs where action='contract.signed' and metadata->>'contract_id' = '$contractId';")
if ([int]$contractAudit -gt 0) { Pass('contract.signed audit recorded') } else { Fail('Missing contract.signed audit entry') }

$projectAudit = Run-Sql("select count(*) from audit_logs where action='project.status_changed' and metadata->>'project_id' = '$projectId' and metadata->>'reason' = 'contract.sync';")
if ([int]$projectAudit -gt 0) { Pass('project.status_changed audit recorded for contract.sync') } else { Fail('Missing project.status_changed audit for contract.sync') }

Write-Host "`n=== Step 2: SIGNED -> INSTALLING ===" -ForegroundColor Yellow
Invoke-AssertSuccess 'Transition to INSTALLING' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/transition" '{"to_status":"INSTALLING"}'
$projectDetail = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId" -Headers $headers -Method GET -UseBasicParsing
$projectStatus = ($projectDetail.value.status -as [string]).ToUpper()
if ($projectStatus -ne 'INSTALLED') {
    Fail("Project status expected INSTALLED but got $projectStatus")
}
Pass('Project status is INSTALLED after INSTALLING transition')

Write-Host "`n=== Step 3: INSTALLING -> HANDOVER -> COMPLETED ===" -ForegroundColor Yellow
Invoke-AssertSuccess 'INSTALLING -> HANDOVER' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/transition" '{"to_status":"HANDOVER"}'
Invoke-AssertSuccess 'HANDOVER -> COMPLETED' 'POST' "$BaseUrl/api/projects/$projectId/contracts/$contractId/transition" '{"to_status":"COMPLETED"}'
$projectDetail = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId" -Headers $headers -Method GET -UseBasicParsing
$projectStatus = ($projectDetail.value.status -as [string]).ToUpper()
if ($projectStatus -ne 'COMPLETED') {
    Fail("Project status expected COMPLETED but got $projectStatus")
}
Pass('Project status is COMPLETED after contract lifecycle')

Write-Host "`nAll checks passed. EXITCODE=0" -ForegroundColor Green
exit 0