# F-32 Handovers list v2 verify – A/B/C/D/E/F. No token echo.
# Prereq: Backend running. Optional -Status, -Search, -ProjectId, -ContractId.
# Step F: default docker compose exec; if that fails, fallback psql TCP (same as contracts v2).
# Usage: .\verify-handovers-list-v2.ps1 -DbName solar -Limit 2 -Offset 0 [-Status SIGNED] [-Search "HD-2026"] [-ProjectId "uuid"] [-ContractId "uuid"]
#        [-UseDockerPsql $true] [-PsqlHost localhost] [-PsqlPort 5432] [-PsqlUser postgres] [-PsqlDb solar] [-PsqlPassword postgres]

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
    [Parameter(Mandatory=$false)][int]$Limit = 2,
    [Parameter(Mandatory=$false)][int]$Offset = 0,
    [string]$Status = "",
    [string]$Search = "",
    [string]$ProjectId = "",
    [string]$ContractId = "",
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
Write-Host "`n=== B. GET /api/handovers/v2 limit=$Limit offset=$Offset => 200, paging ==="
$query = "limit=$Limit&offset=$Offset"
if ($Status) { $query += "&status=$Status" }
if ($Search) { $query += "&search=$Search" }
if ($ProjectId) { $query += "&project_id=$ProjectId" }
if ($ContractId) { $query += "&contract_id=$ContractId" }
$list1 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/handovers/v2?$query" -BodyObj $null -ExpectCodes @(200)
if (-not $list1.Json.paging) { Write-Host "FAIL: response must have paging"; exit 1 }
if ($list1.Json.paging.limit -ne $Limit) { Write-Host "FAIL: paging.limit must be $Limit"; exit 1 }
if ($list1.Json.paging.offset -ne $Offset) { Write-Host "FAIL: paging.offset must be $Offset"; exit 1 }
Write-Host "HTTP 200 value.Count=$($list1.Json.value.Count) paging.limit=$($list1.Json.paging.limit) paging.offset=$($list1.Json.paging.offset) paging.count=$($list1.Json.paging.count)"

# ----- C) Pagination offset 0 and offset 2 -----
Write-Host "`n=== C. Pagination limit=2 offset=0 and offset=2 ==="
$page0 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/handovers/v2?limit=2&offset=0" -BodyObj $null -ExpectCodes @(200)
$page2 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/handovers/v2?limit=2&offset=2" -BodyObj $null -ExpectCodes @(200)
if (-not $page0.Json.paging) { Write-Host "FAIL: page0 missing paging"; exit 1 }
if (-not $page2.Json.paging) { Write-Host "FAIL: page2 missing paging"; exit 1 }
Write-Host "offset=0 count=$($page0.Json.value.Count) paging.count=$($page0.Json.paging.count)"
Write-Host "offset=2 count=$($page2.Json.value.Count) paging.count=$($page2.Json.paging.count)"

# ----- D) Search F27 or HD-2026 => at least 1 handover (or SKIP + exit 1 if no data) -----
Write-Host "`n=== D. Search HD-2026 or F27 => at least 1 handover ==="
$searchHd = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/handovers/v2?limit=10&offset=0&search=HD-2026" -BodyObj $null -ExpectCodes @(200)
$countHd = $searchHd.Json.value.Count
if ($countHd -ge 1) {
    Write-Host "search=HD-2026 returned $countHd handover(s) OK"
} else {
    $searchF27 = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/handovers/v2?limit=10&offset=0&search=F27" -BodyObj $null -ExpectCodes @(200)
    $countF27 = $searchF27.Json.value.Count
    if ($countF27 -ge 1) {
        Write-Host "search=F27 returned $countF27 handover(s) OK"
    } else {
        Write-Host "SKIP: no handovers matching search HD-2026 or F27; seed data required for handovers list v2 verify."
        exit 1
    }
}

# ----- E) Filter project_id => every item matches -----
Write-Host "`n=== E. Filter project_id returns handovers of that project ==="
$pidToUse = $ProjectId
if (-not $pidToUse -and $list1.Json.value.Count -gt 0) {
    $pidToUse = $list1.Json.value[0].project.id
}
if ($pidToUse) {
    $projQuery = "limit=20&offset=0&project_id=$pidToUse"
    $byProject = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/handovers/v2?$projQuery" -BodyObj $null -ExpectCodes @(200)
    foreach ($h in $byProject.Json.value) {
        if ($h.project.id -ne $pidToUse) {
            Write-Host "FAIL: handover $($h.id) has project.id=$($h.project.id), expected $pidToUse"
            exit 1
        }
    }
    Write-Host "project_id=$pidToUse returned $($byProject.Json.value.Count) handover(s), all match OK"
} else {
    Write-Host "SKIP: no ProjectId and no handovers to derive project_id"
}

# ----- F) Audit handover.listed last 5 (docker or psql TCP fallback) -----
Write-Host "`n=== F. Audit handover.listed last 5 ==="
$auditQuery = "SELECT action, entity_type, entity_id, metadata, created_at FROM audit_logs WHERE action = 'handover.listed' ORDER BY created_at DESC LIMIT 5;"
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
    Write-Host "FAIL: audit step F could not run; ensure handover.listed rows exist."
    exit 1
}

Write-Host "`nPASS: A/B/C/D/E/F OK. EXITCODE=0"
exit 0
