# F-31 Contracts list v2 verify – A/B/C/D/E/F. No token echo.
# Prereq: Backend running. Optional -Status, -Search "HD-2026", -ProjectId "uuid".
# Step F: default docker compose exec; if that fails, fallback to psql TCP when -PsqlHost etc. or psql.exe found; else print 1-line manual command.
# Usage: .\verify-contracts-list-v2.ps1 -DbName solar -Limit 2 -Offset 0 [-Status COMPLETED] [-Search "HD-2026"] [-ProjectId "6179..."]
#        [-UseDockerPsql $true] [-PsqlHost localhost] [-PsqlPort 5432] [-PsqlUser postgres] [-PsqlDb solar] [-PsqlPassword postgres]

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
    [Parameter(Mandatory=$false)][int]$Limit = 2,
    [Parameter(Mandatory=$false)][int]$Offset = 0,
    [string]$Status = "",
    [string]$Search = "",
    [string]$ProjectId = "",
    [string]$BaseUrl = "http://localhost:3000",
    [Parameter(Mandatory=$false)][bool]$UseDockerPsql = $true,
    [string]$PsqlHost = "localhost",
    [int]$PsqlPort = 5432,
    [string]$PsqlUser = "postgres",
    [string]$PsqlDb = "",
    [string]$PsqlPassword = "postgres"
)
if ([string]::IsNullOrEmpty($PsqlDb)) { $PsqlDb = $DbName }

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

# ----- B) GET list v2 => 200, paging -----
Write-Host "`n=== B. GET /api/contracts/v2 limit=$Limit offset=$Offset => 200, paging ==="
$query = "limit=$Limit&offset=$Offset"
if ($Status) { $query += "&status=$Status" }
if ($Search) { $query += "&search=$Search" }
if ($ProjectId) { $query += "&project_id=$ProjectId" }
$list1 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/contracts/v2?$query" -BodyObj $null -ExpectCodes @(200)
if (-not $list1.Json.paging) { Write-Host "FAIL: response must have paging"; exit 1 }
if ($list1.Json.paging.limit -ne $Limit) { Write-Host "FAIL: paging.limit must be $Limit"; exit 1 }
if ($list1.Json.paging.offset -ne $Offset) { Write-Host "FAIL: paging.offset must be $Offset"; exit 1 }
Write-Host "HTTP 200 value.Count=$($list1.Json.value.Count) paging.limit=$($list1.Json.paging.limit) paging.offset=$($list1.Json.paging.offset) paging.count=$($list1.Json.paging.count)"

# ----- C) Pagination offset 0 and offset 2 -----
Write-Host "`n=== C. Pagination limit=2 offset=0 and offset=2 ==="
$page0 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/contracts/v2?limit=2&offset=0" -BodyObj $null -ExpectCodes @(200)
$page2 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/contracts/v2?limit=2&offset=2" -BodyObj $null -ExpectCodes @(200)
if (-not $page0.Json.paging) { Write-Host "FAIL: page0 missing paging"; exit 1 }
if (-not $page2.Json.paging) { Write-Host "FAIL: page2 missing paging"; exit 1 }
Write-Host "offset=0 count=$($page0.Json.value.Count) paging.count=$($page0.Json.paging.count)"
Write-Host "offset=2 count=$($page2.Json.value.Count) paging.count=$($page2.Json.paging.count)"

# ----- D) Search HD-2026 => at least 1 contract -----
Write-Host "`n=== D. Search HD-2026 => at least 1 contract ==="
$searchList = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/contracts/v2?limit=10&offset=0&search=HD-2026" -BodyObj $null -ExpectCodes @(200)
$countSearch = $searchList.Json.value.Count
if ($countSearch -lt 1) { Write-Host "FAIL: search=HD-2026 expected at least 1 contract, got $countSearch"; exit 1 }
Write-Host "search=HD-2026 returned $countSearch contract(s) OK"

# ----- E) Filter project_id returns contracts of that project -----
Write-Host "`n=== E. Filter project_id returns contracts of that project ==="
$pidToUse = $ProjectId
if (-not $pidToUse -and $list1.Json.value.Count -gt 0) {
    $pidToUse = $list1.Json.value[0].project.id
}
if ($pidToUse) {
    $projQuery = "limit=20&offset=0&project_id=$pidToUse"
    $byProject = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/contracts/v2?$projQuery" -BodyObj $null -ExpectCodes @(200)
    foreach ($c in $byProject.Json.value) {
        if ($c.project.id -ne $pidToUse) {
            Write-Host "FAIL: contract $($c.id) has project.id=$($c.project.id), expected $pidToUse"
            exit 1
        }
    }
    Write-Host "project_id=$pidToUse returned $($byProject.Json.value.Count) contract(s), all match OK"
} else {
    Write-Host "SKIP: no ProjectId and no contracts to derive project_id"
}

# ----- F) Audit contract.listed last 5 -----
Write-Host "`n=== F. Audit contract.listed last 5 ==="
$auditQuery = "SELECT action, entity_type, entity_id, metadata, created_at FROM audit_logs WHERE action = 'contract.listed' ORDER BY created_at DESC LIMIT 5;"
$fDone = $false

if ($UseDockerPsql) {
    $repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
    Push-Location $repoRoot
    try {
        $dockerOut = docker compose exec -T postgres psql -U postgres -d $DbName -c $auditQuery 2>&1
        Write-Host $dockerOut
        if ($LASTEXITCODE -eq 0) { $fDone = $true }
    } catch {
        # docker failed, fall through to fallback
    } finally {
        Pop-Location
    }
}

if (-not $fDone) {
    $psqlCmd = $null
    $psqlExe = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($psqlExe) { $psqlCmd = $psqlExe.Source }
    if (-not $psqlCmd) {
        $psqlExe = Get-Command psql -ErrorAction SilentlyContinue
        if ($psqlExe) { $psqlCmd = $psqlExe.Source }
    }
    if (-not $psqlCmd) {
        Write-Host "FAIL: psql not found; install PostgreSQL client or add to PATH"
        exit 1
    }
    $old = $env:PGPASSWORD
    $env:PGPASSWORD = $PsqlPassword
    try {
        $tcpOut = & $psqlCmd -h $PsqlHost -p $PsqlPort -U $PsqlUser -d $PsqlDb -c $auditQuery 2>&1
        Write-Host $tcpOut
        if ($LASTEXITCODE -eq 0) { $fDone = $true }
    } finally {
        if ($null -ne $old) { $env:PGPASSWORD = $old } else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    }
}

if (-not $fDone) {
    Write-Host "Docker psql failed and psql TCP fallback unavailable or failed. Run audit manually (from repo root):"
    Write-Host "docker compose exec -T postgres psql -U postgres -d $DbName -c `"$auditQuery`""
    Write-Host "FAIL: audit step F could not run; ensure contract.listed rows exist."
    exit 1
}

Write-Host "`nPASS: A/B/C/D/E/F OK. EXITCODE=0"
exit 0
