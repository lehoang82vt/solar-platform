# F-27 Contract lifecycle verify – A/B/C/D/E on DB. No token echo.
# Prereq: $env:SOLAR_TOKEN set. APPROVED quote with price_total; optional QuoteIdDraft for D1.
# Usage: .\verify-contracts.ps1 -DbName solar -ProjectId "<UUID>" -QuoteId "<QUOTE_ID>" [-QuoteIdDraft "<UUID>"]

param(
    [Parameter(Mandatory=$false)][string]$DbName = "solar",
    [Parameter(Mandatory=$true)][string]$ProjectId,
    [Parameter(Mandatory=$true)][string]$QuoteId,
    [string]$QuoteIdDraft = "",
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

# ----- D2: payment_terms sum != 100 => 400 -----
Write-Host "=== D2. Create contract payment_terms sum != 100 => 400 ==="
$bodyBadPct = @{
    quote_id = $QuoteId
    payment_terms = @(
        @{ milestone = "A"; pct = 50 }
        @{ milestone = "B"; pct = 40 }
    )
}
$r = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts" -BodyObj $bodyBadPct -ExpectCodes @(400)
Write-Host "HTTP $($r.Code) (expected 400) OK"

# ----- D1: quote not approved => 422 (optional) -----
if ($QuoteIdDraft) {
    Write-Host "=== D1. Create contract quote not approved => 422 ==="
    $bodyDraft = @{
        quote_id = $QuoteIdDraft
        payment_terms = @( @{ milestone = "Full"; pct = 100 } )
    }
    $r1 = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts" -BodyObj $bodyDraft -ExpectCodes @(422)
    Write-Host "HTTP $($r1.Code) (expected 422) OK"
} else {
    Write-Host "=== D1. Skipped (no -QuoteIdDraft) ==="
}

# ----- A. Create contract -----
Write-Host "=== A. POST Create contract ==="
$bodyCreate = @{
    quote_id = $QuoteId
    payment_terms = @(
        @{ milestone = "Ky hop dong"; pct = 50 }
        @{ milestone = "Hoan tat lap dat"; pct = 40 }
        @{ milestone = "Nghiem thu"; pct = 10 }
    )
    warranty_terms = "Bao hanh 5 nam thiet bi, 25 nam hieu suat"
    construction_days = 7
}
$create = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts" -BodyObj $bodyCreate -ExpectCodes @(201)
$cid = $create.Json.value.id
$cnum = $create.Json.value.contract_number
$status = $create.Json.value.status
$cv = $create.Json.value.contract_value
Write-Host "HTTP 201 contract_number=$cnum status=$status contract_value=$cv"
if ($cnum -notmatch '^HD-\d{4}-\d{3}$') { Write-Host "FAIL: contract_number format HD-YYYY-xxx"; exit 1 }
if ($status -ne "DRAFT") { Write-Host "FAIL: expected status=DRAFT"; exit 1 }

# ----- B. Sign -----
Write-Host "`n=== B. POST Sign contract ==="
$sign = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts/$cid/sign" -BodyObj $null -ExpectCodes @(200)
if ($sign.Json.value.status -ne "SIGNED") { Write-Host "FAIL: expected status=SIGNED"; exit 1 }
if (-not $sign.Json.value.signed_at) { Write-Host "FAIL: expected signed_at"; exit 1 }
Write-Host "HTTP 200 status=SIGNED signed_at present OK"

# ----- D4: PATCH immutable after SIGNED => 422 -----
Write-Host "`n=== D4. PATCH immutable after SIGNED => 422 ==="
$bodyPatch = @{ contract_value = 999 }
$patchR = Invoke-CurlJson -Method PATCH -Url "$BaseUrl/api/projects/$ProjectId/contracts/$cid" -BodyObj $bodyPatch -ExpectCodes @(422)
Write-Host "HTTP $($patchR.Code) (expected 422) OK"

# ----- D3: CANCEL missing reason => 400 -----
Write-Host "`n=== D3. Transition CANCEL missing reason => 400 ==="
$bodyCancelNoReason = @{ action = "CANCEL" }
$cancelR = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts/$cid/transition" -BodyObj $bodyCancelNoReason -ExpectCodes @(400)
Write-Host "HTTP $($cancelR.Code) (expected 400) OK"

# ----- C. Transition INSTALL -> HANDOVER -> COMPLETED -----
Write-Host "`n=== C. POST Transition INSTALL ==="
$t1Body = @{ action = "INSTALL" }
$t1 = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts/$cid/transition" -BodyObj $t1Body -ExpectCodes @(200)
if ($t1.Json.value.status -ne "INSTALLING") { Write-Host "FAIL: expected status=INSTALLING"; exit 1 }
Write-Host "HTTP 200 status=INSTALLING OK"

Write-Host "`n=== C. POST Transition HANDOVER ==="
$t2Body = @{ action = "HANDOVER" }
$t2 = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts/$cid/transition" -BodyObj $t2Body -ExpectCodes @(200)
if ($t2.Json.value.status -ne "HANDOVER") { Write-Host "FAIL: expected status=HANDOVER"; exit 1 }
Write-Host "HTTP 200 status=HANDOVER OK"

Write-Host "`n=== C. POST Transition COMPLETE ==="
$t3Body = @{ action = "COMPLETE" }
$t3 = Invoke-CurlJson -Method POST -Url "$BaseUrl/api/projects/$ProjectId/contracts/$cid/transition" -BodyObj $t3Body -ExpectCodes @(200)
if ($t3.Json.value.status -ne "COMPLETED") { Write-Host "FAIL: expected status=COMPLETED"; exit 1 }
Write-Host "HTTP 200 status=COMPLETED OK"

# ----- E. Audit + schema -----
Write-Host "`n=== E. Audit evidence (psql) ==="
$auditQuery = "SELECT action, entity_id, metadata, created_at FROM audit_logs WHERE action IN ('contract.created','contract.signed','contract.transitioned','contract.cancelled','contract.create.quote_not_approved') ORDER BY created_at DESC LIMIT 10;"
docker compose exec -T postgres psql -U postgres -d $DbName -c $auditQuery
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: audit psql failed"; exit 1 }

Write-Host "`n=== E. Schema \d quotes, \d contracts ==="
docker compose exec -T postgres psql -U postgres -d $DbName -c "\d quotes"
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: \d quotes failed"; exit 1 }
docker compose exec -T postgres psql -U postgres -d $DbName -c "\d contracts"
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL: \d contracts failed"; exit 1 }

Write-Host "`nPASS: A/B/C/D/E OK. EXITCODE=0"
exit 0
