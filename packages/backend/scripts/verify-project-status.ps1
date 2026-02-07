# F-29 Project status verify – A/B/C/D/E. No token echo.
# Prereq: $env:SOLAR_TOKEN set. Project with contract COMPLETED + handover COMPLETED (e.g. 6179c652-...).
# Usage: .\verify-project-status.ps1 -DbName solar -ProjectId "6179c652-39c6-45aa-b88a-36c945a470c3"

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
    [Parameter(Mandatory=$true)][string]$ProjectId,
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

# ----- A) \d projects: cột status, default NEW -----
Write-Host "=== A. Schema \d projects ==="
$repoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
Push-Location $repoRoot
try {
    docker compose exec -T postgres psql -U postgres -d $DbName -c "\d projects"
    if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: \d projects failed"; exit 1 }
} finally {
    Pop-Location
}

# ----- B) Recompute => 200, status = COMPLETED -----
Write-Host "`n=== B. POST status/recompute => 200, status=COMPLETED ==="
$recompute = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/status/recompute" -BodyObj $null -ExpectCodes @(200)
$newStatus = $recompute.Json.value.status
if ($newStatus -ne "COMPLETED") { Write-Host "FAIL: expected status=COMPLETED, got $newStatus"; exit 1 }
Write-Host "HTTP 200 status=$newStatus OK"

# ----- C) Negative: CANCELLED thiếu reason => 400 -----
Write-Host "`n=== C. Transition CANCELLED without reason => 400 ==="
$bodyNoReason = @{ to_status = "CANCELLED" }
$noReason = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/status/transition" -BodyObj $bodyNoReason -ExpectCodes @(400)
Write-Host "HTTP 400 OK"

# ----- D) Transition CANCELLED có reason => 200 status=CANCELLED -----
Write-Host "`n=== D. Transition CANCELLED with reason => 200 ==="
$bodyCancel = @{ to_status = "CANCELLED"; reason = "F29 verify test" }
$cancel = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/status/transition" -BodyObj $bodyCancel -ExpectCodes @(200)
if ($cancel.Json.value.status -ne "CANCELLED") { Write-Host "FAIL: expected status=CANCELLED"; exit 1 }
Write-Host "HTTP 200 status=CANCELLED OK"

# ----- E) Audit project.status_changed -----
Write-Host "`n=== E. Audit project.status_changed ==="
Push-Location $repoRoot
try {
    $auditQuery = "SELECT action, entity_id, metadata, created_at FROM audit_logs WHERE action = 'project.status_changed' AND metadata->>'project_id' = '$ProjectId' ORDER BY created_at DESC LIMIT 5;"
    docker compose exec -T postgres psql -U postgres -d $DbName -c $auditQuery
    if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: audit psql failed"; exit 1 }
} finally {
    Pop-Location
}

Write-Host "`nPASS: A/B/C/D/E OK. EXITCODE=0"
exit 0
