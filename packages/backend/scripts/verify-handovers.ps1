# F-28 Handover lifecycle verify – A/B/C/D/E/F. No token echo.
# Prereq: $env:SOLAR_TOKEN set. Project must have at least one contract in HANDOVER or COMPLETED.
# Usage: .\verify-handovers.ps1 -DbName solar -ProjectId "<UUID>" [-ContractId "<UUID>"]

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
    [Parameter(Mandatory=$true)][string]$ProjectId,
    [string]$ContractId = "",
    [string]$HandoverId = "",
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$token = $env:SOLAR_TOKEN
if (-not $token) { Write-Host "FAIL: SOLAR_TOKEN not set"; exit 1 }

function Invoke-CurlJson {
    param([string]$Method, [string]$Url, [object]$BodyObj, [int[]]$ExpectCodes)
    $authHeader = "Authorization: Bearer $token"
    $ctHeader = "Content-Type: application/json"
    $bodyArg = ""
    if ($null -ne $BodyObj) {
        $bodyArg = $BodyObj | ConvertTo-Json -Depth 10 -Compress
    }
    $out = if ($bodyArg.Length -gt 0) {
        $tmpFile = [System.IO.Path]::GetTempFileName()
        try {
            [System.IO.File]::WriteAllText($tmpFile, $bodyArg, [System.Text.UTF8Encoding]::new($false))
            curl.exe -s -w "`n%{http_code}" -X $Method $Url -H $authHeader -H $ctHeader --data "@$tmpFile"
        } finally {
            Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue
        }
    } else {
        curl.exe -s -w "`n%{http_code}" -X $Method $Url -H $authHeader -H $ctHeader
    }
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
        $preview = if ($raw.Length -gt 0) { $raw.Substring(0, [Math]::Min(500, $raw.Length)) } else { "(empty)" }
        Write-Host "FAIL: 2xx but body not JSON. Raw (500 chars): $preview"
        exit 1
    }
    if ($ExpectCodes -notcontains $code) {
        Write-Host "FAIL: HTTP $code (expected $($ExpectCodes -join '/'))"
        if ($raw.Length -gt 0) { $preview = $raw.Substring(0, [Math]::Min(500, $raw.Length)); Write-Host "Raw (500 chars): $preview" }
        exit 1
    }
    return @{ Code = $code; Raw = $raw; Json = $json }
}

# ----- D2: create with missing required keys => 422 + missing_fields -----
Write-Host "=== D2. Create handover missing required keys => 422 ==="
$bodyBad = @{ acceptance_json = @{} }
$r2 = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/handovers" -BodyObj $bodyBad -ExpectCodes @(422)
if ($r2.Json.missing_fields) { Write-Host "HTTP 422 missing_fields present OK" } else { Write-Host "HTTP 422 OK" }

# ----- A. Create DRAFT -----
Write-Host "`n=== A. POST Create handover (DRAFT) ==="
$acceptance = @{
    site_address = "123 Solar St"
    handover_date = "2026-02-06"
    representative_a = "Rep A"
    representative_b = "Rep B"
    checklist = @(
        @{ name = "Item 1"; status = $true }
        @{ name = "Item 2"; status = $false }
    )
    notes = "F28 verify"
}
$bodyCreate = @{
    acceptance_json = $acceptance
}
if ($ContractId) { $bodyCreate.contract_id = $ContractId }
$create = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/handovers" -BodyObj $bodyCreate -ExpectCodes @(201)
$hid = $create.Json.value.id
$hstatus = $create.Json.value.status
Write-Host "HTTP 201 handover_id=$hid status=$hstatus"
if ($hstatus -ne "DRAFT") { Write-Host "FAIL: expected status=DRAFT"; exit 1 }

# ----- B. PATCH acceptance_json (DRAFT) -----
Write-Host "`n=== B. PATCH acceptance_json (DRAFT) => 200 ==="
$acceptance2 = @{
    site_address = "456 Updated St"
    handover_date = "2026-02-07"
    representative_a = "Rep A2"
    representative_b = "Rep B2"
    checklist = @( @{ name = "C1"; status = $true } )
    notes = "Updated"
}
$bodyPatch = @{ acceptance_json = $acceptance2 }
$patchR = Invoke-CurlJson -Method PATCH -Url "$BaseUrl/api/projects/$ProjectId/handovers/$hid" -BodyObj $bodyPatch -ExpectCodes @(200)
Write-Host "HTTP 200 OK"

# ----- D3: complete before SIGNED => 422 invalid_state -----
Write-Host "`n=== D3. Complete before SIGNED => 422 ==="
$completeEarly = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/handovers/$hid/complete" -BodyObj $null -ExpectCodes @(422)
Write-Host "HTTP 422 OK"

# ----- C. Sign => SIGNED -----
Write-Host "`n=== C. POST Sign => 200 SIGNED ==="
$signR = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/handovers/$hid/sign" -BodyObj $null -ExpectCodes @(200)
if ($signR.Json.value.status -ne "SIGNED") { Write-Host "FAIL: expected status=SIGNED"; exit 1 }
if (-not $signR.Json.value.signed_at) { Write-Host "FAIL: expected signed_at"; exit 1 }
Write-Host "HTTP 200 status=SIGNED signed_at present OK"

# ----- D1: PATCH after SIGNED => 422 immutable -----
Write-Host "`n=== D1. PATCH after SIGNED => 422 immutable ==="
$bodyImmutable = @{ acceptance_json = @{ site_address = "x"; handover_date = "2026-01-01"; representative_a = "a"; representative_b = "b"; checklist = @() } }
$patchImmutable = Invoke-CurlJson -Method PATCH -Url "$BaseUrl/api/projects/$ProjectId/handovers/$hid" -BodyObj $bodyImmutable -ExpectCodes @(422)
Write-Host "HTTP 422 OK"

# ----- E. Complete => COMPLETED -----
Write-Host "`n=== E. POST Complete => 200 COMPLETED ==="
$completeR = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/handovers/$hid/complete" -BodyObj $null -ExpectCodes @(200)
if ($completeR.Json.value.status -ne "COMPLETED") { Write-Host "FAIL: expected status=COMPLETED"; exit 1 }
Write-Host "HTTP 200 status=COMPLETED OK"

# ----- F. Audit evidence -----
Write-Host "`n=== F. Audit evidence (psql) ==="
$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
Push-Location $repoRoot
try {
    $auditQuery = "SELECT action, entity_id, metadata, created_at FROM audit_logs WHERE action IN ('handover.created','handover.signed','handover.completed','handover.updated') ORDER BY created_at DESC LIMIT 10;"
    docker compose exec -T postgres psql -U postgres -d $DbName -c $auditQuery
    if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: audit psql failed"; exit 1 }
} finally {
    Pop-Location
}

Write-Host "`nPASS: A/B/C/D/E/F OK. EXITCODE=0"
exit 0
