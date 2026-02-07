# F-33 Projects list v3 verify – A/B/C/D/E/F. No token echo.
# Prereq: Backend running. Optional -Status, -Search.
# Step F: default docker compose exec; if that fails, fallback psql TCP (same as F-31/32).
# Usage: .\verify-projects-list-v3.ps1 -DbName solar -Limit 2 -Offset 0 [-Status NEW] [-Search "F27"]
#        [-UseDockerPsql $true] [-PsqlHost localhost] [-PsqlPort 5432] [-PsqlUser postgres] [-PsqlDb solar] [-PsqlPassword postgres]

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
    [Parameter(Mandatory=$false)][int]$Limit = 2,
    [Parameter(Mandatory=$false)][int]$Offset = 0,
    [string]$Status = "",
    [string]$Search = "",
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

# ----- B) GET /api/projects/v3?limit=2&offset=0 => 200, paging -----
Write-Host "`n=== B. GET /api/projects/v3 limit=$Limit offset=$Offset => 200, paging ==="
$query = "limit=$Limit&offset=$Offset"
if ($Status) { $query += "&status=$Status" }
if ($Search) { $query += "&search=$Search" }
$list1 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/projects/v3?$query" -BodyObj $null -ExpectCodes @(200)
if (-not $list1.Json.paging) { Write-Host "FAIL: response must have paging"; exit 1 }
if ($list1.Json.paging.limit -ne $Limit) { Write-Host "FAIL: paging.limit must be $Limit"; exit 1 }
if ($list1.Json.paging.offset -ne $Offset) { Write-Host "FAIL: paging.offset must be $Offset"; exit 1 }
Write-Host "HTTP 200 value.Count=$($list1.Json.value.Count) paging.limit=$($list1.Json.paging.limit) paging.offset=$($list1.Json.paging.offset) paging.count=$($list1.Json.paging.count)"

# ----- C) Pagination offset 0 and offset 2 -----
Write-Host "`n=== C. Pagination limit=2 offset=0 and offset=2 ==="
$page0 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/projects/v3?limit=2&offset=0" -BodyObj $null -ExpectCodes @(200)
$page2 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/projects/v3?limit=2&offset=2" -BodyObj $null -ExpectCodes @(200)
if (-not $page0.Json.paging) { Write-Host "FAIL: page0 missing paging"; exit 1 }
if (-not $page2.Json.paging) { Write-Host "FAIL: page2 missing paging"; exit 1 }
Write-Host "offset=0 count=$($page0.Json.value.Count) paging.count=$($page0.Json.paging.count)"
Write-Host "offset=2 count=$($page2.Json.value.Count) paging.count=$($page2.Json.paging.count)"

# ----- D) Search F27 or HCM => at least 1 project -----
Write-Host "`n=== D. Search F27 or HCM => at least 1 project ==="
$searchF27 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/projects/v3?limit=10&offset=0&search=F27" -BodyObj $null -ExpectCodes @(200)
$countF27 = $searchF27.Json.value.Count
if ($countF27 -ge 1) {
    Write-Host "search=F27 returned $countF27 project(s) OK"
} else {
    $searchHcm = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/projects/v3?limit=10&offset=0&search=HCM" -BodyObj $null -ExpectCodes @(200)
    $countHcm = $searchHcm.Json.value.Count
    if ($countHcm -ge 1) {
        Write-Host "search=HCM returned $countHcm project(s) OK"
    } else {
        Write-Host "SKIP: no projects matching search F27 or HCM; seed data required for projects list v3 verify."
        exit 1
    }
}

# ----- E) Filter status (NEW or status from first item) -----
Write-Host "`n=== E. Filter status => projects match -----"
$statusToUse = $Status
if (-not $statusToUse -and $list1.Json.value.Count -gt 0) {
    $statusToUse = $list1.Json.value[0].status
}
if ($statusToUse) {
    $statusQuery = "limit=20&offset=0&status=$statusToUse"
    $byStatus = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/projects/v3?$statusQuery" -BodyObj $null -ExpectCodes @(200)
    foreach ($proj in $byStatus.Json.value) {
        if ($proj.status -ne $statusToUse) {
            Write-Host "FAIL: project $($proj.id) has status=$($proj.status), expected $statusToUse"
            exit 1
        }
    }
    Write-Host "status=$statusToUse returned $($byStatus.Json.value.Count) project(s), all match OK"
} else {
    Write-Host "SKIP: no Status param and no projects to derive status"
}

# ----- F) Audit project.listed last 5 (docker or psql TCP fallback) -----
Write-Host "`n=== F. Audit project.listed last 5 ==="
$auditQuery = "SELECT action, entity_type, entity_id, metadata, created_at FROM audit_logs WHERE action = 'project.listed' ORDER BY created_at DESC LIMIT 5;"
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
    $psqlExe = $null
    try { $psqlExe = (Get-Command psql -ErrorAction Stop).Source } catch {}
    if ($psqlExe) {
        $env:PGPASSWORD = $PsqlPassword
        try {
            $tcpOut = & $psqlExe -h $PsqlHost -p $PsqlPort -U $PsqlUser -d $PsqlDb -t -c $auditQuery 2>&1
            Write-Host $tcpOut
            if ($LASTEXITCODE -eq 0) { $fDone = $true }
        } finally {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
    }
}

if (-not $fDone) {
    Write-Host "Docker psql failed and psql TCP fallback unavailable or failed. Run audit manually (from repo root):"
    Write-Host "docker compose exec -T postgres psql -U postgres -d $DbName -c `"$auditQuery`""
    Write-Host "FAIL: audit step F could not run; ensure project.listed rows exist."
    exit 1
}

Write-Host "`nPASS: A/B/C/D/E/F OK. EXITCODE=0"
exit 0
