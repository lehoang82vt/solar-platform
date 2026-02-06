# Verify F-09 through F-16 in order. Exit non-zero and print FAIL at <step> on first failure.
$ErrorActionPreference = 'Stop'
$backendRoot = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { $PWD.Path }
Set-Location $backendRoot

npm run lint
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at lint"; exit 1 }

npm run typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at typecheck"; exit 1 }

node --test src/__tests__/f09.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f09"; exit 1 }

node --test src/__tests__/f10.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f10"; exit 1 }

node --test src/__tests__/f11.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f11"; exit 1 }

node --test src/__tests__/f12.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f12"; exit 1 }

node --test src/__tests__/f13.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f13"; exit 1 }

node --test src/__tests__/f14.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f14"; exit 1 }

node --test src/__tests__/f15.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f15"; exit 1 }

node --test src/__tests__/f16.test.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAIL at f16"; exit 1 }

Write-Host "PASS"
exit 0
