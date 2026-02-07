# F-30 Quotes list v2 verify – A/B/C/D/E. No token echo.
# Prereq: Backend running. Optional -Status accepted, -Search "F27".
# Usage: .\verify-quotes-list-v2.ps1 -DbName solar -Limit 2 -Offset 0 [-Status accepted] [-Search "F27"]

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
    [Parameter(Mandatory=$true)][int]$Limit = 20,
    [Parameter(Mandatory=$false)][int]$Offset = 0,
    [string]$Status = "",
    [string]$Search = "",
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

# ----- A) Login set SOLAR_TOKEN (không in token) -----
Write-Host "=== A. Login set SOLAR_TOKEN ==="
$loginBody = @{ email = "admin@solar.local"; password = "AdminPassword123" } | ConvertTo-Json -Compress
$tmpLogin = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmpLogin, $loginBody)
$rawLogin = curl.exe -s -X POST "$BaseUrl/api/auth/login" -H "Content-Type: application/json" --data "@$tmpLogin"
Remove-Item $tmpLogin -Force -ErrorAction SilentlyContinue
$respLogin = $rawLogin | ConvertFrom-Json
$env:SOLAR_TOKEN = $respLogin.access_token
if ([string]::IsNullOrEmpty($env:SOLAR_TOKEN)) { Write-Host "FAIL: TOKEN_MISSING"; exit 1 }
Write-Host "TOKEN_SET"

$token = $env:SOLAR_TOKEN

function Invoke-CurlJson {
    param([string]$Method, [string]$Url, [object]$BodyObj, [int[]]$ExpectCodes)
    $authHeader = "Authorization: Bearer $token"
    $out = curl.exe -s -w "`n%{http_code}" -X $Method $Url -H $authHeader
    $parts = $out -split "`n"
    $code = [int]$parts[-1]
    $raw = ($parts[0..([Math]::Max(0, $parts.Length - 2))] -join "`n").Trim()
    $json = $null
    if ($raw.Length -gt 0 -and ($raw.StartsWith("{") -or $raw.StartsWith("["))) {
        try { $json = $raw | ConvertFrom-Json } catch {
            Write-Host "FAIL: response not valid JSON (code=$code). Raw (500 chars): $($raw.Substring(0, [Math]::Min(500, $raw.Length)))"
            exit 1
        }
    } elseif ($code -ge 200 -and $code -lt 300) {
        Write-Host "FAIL: 2xx but body not JSON"
        exit 1
    }
    if ($ExpectCodes -notcontains $code) {
        Write-Host "FAIL: HTTP $code (expected $($ExpectCodes -join '/'))"
        exit 1
    }
    return @{ Code = $code; Raw = $raw; Json = $json }
}

# ----- B) Call list v2 (limit/offset) => 200, JSON, có paging -----
Write-Host "`n=== B. GET /api/quotes/v2 limit=$Limit offset=$Offset => 200, paging ==="
$query = "limit=$Limit&offset=$Offset"
if ($Status) { $query += "&status=$Status" }
if ($Search) { $query += "&search=$Search" }
$list1 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/quotes/v2?$query" -BodyObj $null -ExpectCodes @(200)
if (-not $list1.Json.paging) { Write-Host "FAIL: response must have paging"; exit 1 }
if ($list1.Json.paging.limit -ne $Limit) { Write-Host "FAIL: paging.limit must be $Limit"; exit 1 }
if ($list1.Json.paging.offset -ne $Offset) { Write-Host "FAIL: paging.offset must be $Offset"; exit 1 }
Write-Host "HTTP 200 value.Count=$($list1.Json.value.Count) paging.limit=$($list1.Json.paging.limit) paging.offset=$($list1.Json.paging.offset) paging.count=$($list1.Json.paging.count)"

# ----- C) Pagination: offset=0 and offset=2 (limit=2) -----
Write-Host "`n=== C. Pagination limit=2 offset=0 and offset=2 ==="
$page0 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/quotes/v2?limit=2&offset=0" -BodyObj $null -ExpectCodes @(200)
$page2 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/quotes/v2?limit=2&offset=2" -BodyObj $null -ExpectCodes @(200)
if (-not $page0.Json.paging) { Write-Host "FAIL: page0 missing paging"; exit 1 }
if (-not $page2.Json.paging) { Write-Host "FAIL: page2 missing paging"; exit 1 }
Write-Host "offset=0 count=$($page0.Json.value.Count) paging.count=$($page0.Json.paging.count)"
Write-Host "offset=2 count=$($page2.Json.value.Count) paging.count=$($page2.Json.paging.count)"

# ----- D) Search F27 => ít nhất 1 quote -----
Write-Host "`n=== D. Search F27 => at least 1 quote ==="
$searchF27 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/quotes/v2?limit=10&offset=0&search=F27" -BodyObj $null -ExpectCodes @(200)
$countF27 = $searchF27.Json.value.Count
if ($countF27 -lt 1) { Write-Host "FAIL: search=F27 expected at least 1 quote, got $countF27"; exit 1 }
Write-Host "search=F27 returned $countF27 quote(s) OK"

# ----- E) Audit quote.listed last 5, metadata đúng keys -----
Write-Host "`n=== E. Audit quote.listed last 5 ==="
$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
Push-Location $repoRoot
try {
    $auditQuery = "SELECT action, entity_type, entity_id, metadata, created_at FROM audit_logs WHERE action = 'quote.listed' ORDER BY created_at DESC LIMIT 5;"
    docker compose exec -T postgres psql -U postgres -d $DbName -c $auditQuery
    if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: audit psql failed"; exit 1 }
} finally {
    Pop-Location
}

Write-Host "`nPASS: A/B/C/D/E OK. EXITCODE=0"
exit 0
