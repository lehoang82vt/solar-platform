param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Fail([string]$step, [string]$msg) {
  Write-Host "FAIL_$step $msg" -ForegroundColor Red
  exit 1
}

function Json([string]$method, [string]$url, [hashtable]$headers = $null, [object]$body = $null) {
  $h = @{ "Content-Type"="application/json" }
  if ($headers) { foreach ($k in $headers.Keys) { $h[$k] = $headers[$k] } }
  $p = @{ Method=$method; Uri=$url; Headers=$h }
  if ($null -ne $body) { $p.Body = ($body | ConvertTo-Json -Depth 30 -Compress) }
  return Invoke-RestMethod @p
}

Write-Host "=== SOLAR FULL E2E VERIFY ===" -ForegroundColor Cyan

# [0] Health
Write-Host "[0/7] Health..." -ForegroundColor Yellow
try {
  $h = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/health"
  if ($h.status -ne "ok") { Fail "HEALTH" "status!=ok" }
  Write-Host "✓ Health OK" -ForegroundColor Green
} catch { Fail "HEALTH" $_.Exception.Message }

# [1] Login (DO NOT PRINT TOKEN)
Write-Host "[1/7] Login..." -ForegroundColor Yellow
try {
  $login = Json "POST" "$BaseUrl/api/auth/login" $null @{ email="admin@solar.local"; password="AdminPassword123" }
  if (-not $login.access_token) { Fail "LOGIN" "no access_token" }
  $env:SOLAR_TOKEN = $login.access_token
  Write-Host "✓ Login OK (token stored in env)" -ForegroundColor Green
} catch { Fail "LOGIN" $_.Exception.Message }

$auth = @{ Authorization = "Bearer $env:SOLAR_TOKEN" }

# [2] Create customer
Write-Host "[2/7] Create customer..." -ForegroundColor Yellow
$customerId = $null
try {
  $c = Json "POST" "$BaseUrl/api/customers" $auth @{
    name="E2E Customer"
    phone="0900000000"
    email="e2e.customer@solar.local"
    address="E2E Address"
  }
  if ($c.value.id) { $customerId = $c.value.id } elseif ($c.id) { $customerId = $c.id }
  if (-not $customerId) { Fail "CUSTOMER" "no id" }
  Write-Host "✓ customer_id=$customerId" -ForegroundColor Green
} catch { Fail "CUSTOMER" $_.Exception.Message }

# [3] Create project (try customer_id payload then fallback)
Write-Host "[3/7] Create project..." -ForegroundColor Yellow
$projectId = $null
try {
  $p = Json "POST" "$BaseUrl/api/projects" $auth @{
    customer_id=$customerId
    site_address="E2E Site Address"
    note="E2E"
  }
  if ($p.value.id) { $projectId = $p.value.id } elseif ($p.id) { $projectId = $p.id }
} catch {
  try {
    $p = Json "POST" "$BaseUrl/api/projects" $auth @{
      customer_name="E2E Customer"
      phone="0900000000"
      site_address="E2E Site Address"
      roof_area=80
    }
    if ($p.value.id) { $projectId = $p.value.id } elseif ($p.id) { $projectId = $p.id }
  } catch { Fail "PROJECT" $_.Exception.Message }
}
if (-not $projectId) { Fail "PROJECT" "no id" }
Write-Host "✓ project_id=$projectId" -ForegroundColor Green

# [4] Create quote (prefer POST /api/quotes with price_total)
Write-Host "[4/7] Create quote..." -ForegroundColor Yellow
$quoteId = $null
try {
  $q = Json "POST" "$BaseUrl/api/quotes" $auth @{
    project_id=$projectId
    title="E2E Quote"
    price_total=150000000
  }
  if ($q.value.id) { $quoteId = $q.value.id } elseif ($q.id) { $quoteId = $q.id }
  if (-not $quoteId) { Fail "QUOTE" "no id" }
  Write-Host "✓ quote_id=$quoteId" -ForegroundColor Green
} catch { Fail "QUOTE" $_.Exception.Message }

# [5] Approve quote
Write-Host "[5/7] Approve quote..." -ForegroundColor Yellow
try {
  $ap = Json "POST" "$BaseUrl/api/quotes/$quoteId/approve" $auth @{}
  Write-Host "✓ approve OK" -ForegroundColor Green
} catch { Fail "APPROVE" $_.Exception.Message }

# [6] PDF HEAD check
Write-Host "[6/7] Quote PDF..." -ForegroundColor Yellow
try {
  $head = curl.exe -s -I "$BaseUrl/api/quotes/$quoteId/pdf" -H "Authorization: Bearer $env:SOLAR_TOKEN"
  $t = ($head | Out-String)
  if ($t -notmatch "200") { Fail "PDF" "http!=200" }
  if ($t -notmatch "application/pdf") { Fail "PDF" "content-type!=pdf" }
  if ($t -match "Content-Length:\s*(\d+)") {
    $len = [int]$matches[1]
    if ($len -lt 20000) { Fail "PDF" "too small: $len" }
  }
  Write-Host "✓ PDF OK" -ForegroundColor Green
} catch { Fail "PDF" $_.Exception.Message }

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "DEMO_E2E_PASS" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
exit 0
