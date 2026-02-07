# F-35 Contract detail v2 verify – A/B/C/D/E + PASS. No token echo.
# Prereq: Backend running. Optional -ContractId (else from GET /api/contracts/v2?limit=1).
# Step E: docker compose exec psql; fallback psql TCP (same as F-31/32/33/34).
# Usage: .\verify-contract-detail-v2.ps1 -DbName solar [-ContractId "uuid"] [-BaseUrl "http://localhost:3000"]
#        [-UseDockerPsql $true] [-PsqlHost localhost] [-PsqlPort 5432] [-PsqlUser postgres] [-PsqlDb solar] [-PsqlPassword postgres]

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
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

# Resolve contract id if not provided
$contractIdToUse = $ContractId
if (-not $contractIdToUse) {
    $listResp = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/contracts/v2?limit=1&offset=0" -BodyObj $null -ExpectCodes @(200)
    if (-not $listResp.Json.value -or $listResp.Json.value.Count -lt 1) {
        Write-Host "FAIL: no contracts to test; create a contract or pass -ContractId"
        exit 1
    }
    $contractIdToUse = $listResp.Json.value[0].id
}
Write-Host "Using contract id: $contractIdToUse"

# ----- B) GET /api/contracts/<id>/v2 => 200; id, status, contract_number -----
Write-Host "`n=== B. GET /api/contracts/$contractIdToUse/v2 => 200, id/status/contract_number ==="
$detail = Invoke-CurlJson -Method GET -Url "$BaseUrl/api/contracts/$contractIdToUse/v2" -BodyObj $null -ExpectCodes @(200)
if (-not $detail.Json.id) { Write-Host "FAIL: response must have id"; exit 1 }
if ($null -eq $detail.Json.status) { Write-Host "FAIL: response must have status"; exit 1 }
if (-not $detail.Json.contract_number) { Write-Host "FAIL: response must have contract_number"; exit 1 }
Write-Host "HTTP 200 id=$($detail.Json.id) status=$($detail.Json.status) contract_number=$($detail.Json.contract_number)"

# ----- C) Keys project/quote/customer/handover tồn tại (có thể null) -----
Write-Host "`n=== C. Keys project/quote/customer/handover exist ==="
if (-not $detail.Json.PSObject.Properties['project']) { Write-Host "FAIL: response must have project key"; exit 1 }
if (-not $detail.Json.PSObject.Properties['quote']) { Write-Host "FAIL: response must have quote key"; exit 1 }
if (-not $detail.Json.PSObject.Properties['customer']) { Write-Host "FAIL: response must have customer key"; exit 1 }
if (-not $detail.Json.PSObject.Properties['handover']) { Write-Host "FAIL: response must have handover key"; exit 1 }
Write-Host "project/quote/customer/handover keys OK"

# ----- D) Fake id => 404 JSON -----
Write-Host "`n=== D. 404 for fake id ==="
$fakeId = "00000000-0000-0000-0000-000000000000"
$authHeader = "Authorization: Bearer $token"
$out404 = curl.exe -s -w "`n%{http_code}" -X GET "$BaseUrl/api/contracts/$fakeId/v2" -H $authHeader
$parts404 = $out404 -split "`n"
$code404 = [int]$parts404[-1]
$raw404 = ($parts404[0..([Math]::Max(0, $parts404.Length - 2))] -join "`n").Trim()
if ($code404 -ne 404) {
    Write-Host "FAIL: GET fake id expected 404, got $code404"
    exit 1
}
if ($raw404.Length -gt 0 -and ($raw404.StartsWith("{") -or $raw404.StartsWith("["))) {
    $json404 = $raw404 | ConvertFrom-Json
    if (-not $json404.PSObject.Properties['error']) {
        Write-Host "FAIL: 404 response should be JSON with error key"
        exit 1
    }
}
Write-Host "GET $fakeId/v2 => 404 JSON OK"

# ----- E) Audit contract.viewed last 5 (docker or psql TCP fallback) -----
Write-Host "`n=== E. Audit contract.viewed last 5 ==="
$auditQuery = "SELECT action, entity_type, entity_id FROM audit_logs WHERE action='contract.viewed' ORDER BY created_at DESC LIMIT 5;"
$eDone = $false

# E.1 If -UseDockerPsql $true then try docker compose exec
if ($UseDockerPsql) {
    $repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
    Push-Location $repoRoot
    try {
        $dockerOut = docker compose exec -T postgres psql -U postgres -d $DbName -c $auditQuery 2>&1
        Write-Host $dockerOut
        if ($LASTEXITCODE -eq 0) { $eDone = $true }
    } catch {
        # docker failed, fall through to fallback
    } finally {
        Pop-Location
    }
}

# E.2 If docker failed or -UseDockerPsql $false => TCP fallback
if (-not $eDone) {
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
        if ($LASTEXITCODE -eq 0) { $eDone = $true }
    } finally {
        if ($null -ne $old) { $env:PGPASSWORD = $old } else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    }
}

if (-not $eDone) {
    Write-Host "Docker psql failed and psql TCP fallback failed. Run audit manually (from repo root):"
    Write-Host "docker compose exec -T postgres psql -U postgres -d $DbName -c `"$auditQuery`""
    Write-Host "FAIL: audit step E could not run; ensure contract.viewed rows exist."
    exit 1
}

Write-Host "`nPASS: A/B/C/D/E OK. EXITCODE=0"
exit 0
