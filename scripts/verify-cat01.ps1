# CAT-01 Verification - Run when Docker + Postgres are up
# Usage: from repo root: .\scripts\verify-cat01.ps1

$ErrorActionPreference = "Stop"
Write-Host "=== BƯỚC 1: Table count TRƯỚC migrate ===" -ForegroundColor Cyan
docker compose exec -T postgres psql -U postgres -d solar -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"
$before = (docker compose exec -T postgres psql -U postgres -d solar -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';").Trim()
Write-Host "GHI LẠI SỐ NÀY (before): $before" -ForegroundColor Yellow

Write-Host "`n=== BƯỚC 2: Run migrations ===" -ForegroundColor Cyan
Set-Location packages\backend
npm run migrate
Set-Location ..\..

Write-Host "`n=== BƯỚC 3: Table count SAU migrate ===" -ForegroundColor Cyan
$after = (docker compose exec -T postgres psql -U postgres -d solar -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';").Trim()
docker compose exec -T postgres psql -U postgres -d solar -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';"
Write-Host "PHẢI tăng +4 (before=$before, after=$after)" -ForegroundColor Yellow

Write-Host "`n=== BƯỚC 4: Seed data THẬT ===" -ForegroundColor Cyan
docker compose exec -T postgres psql -U postgres -d solar -c "SELECT sku, brand, model, power_watt FROM catalog_pv_modules WHERE sku='PV-SAMPLE-550W';"

Write-Host "`n=== BƯỚC 5: RLS verification (fake org -> 0 rows) ===" -ForegroundColor Cyan
docker compose exec -T postgres psql -U postgres -d solar -c "SET app.current_org_id='00000000-0000-0000-0000-000000000000'; SELECT COUNT(*) FROM catalog_pv_modules;"

Write-Host "`n=== BƯỚC 6: Run tests ===" -ForegroundColor Cyan
Set-Location packages\backend
node -r ts-node/register --test src/__tests__/cat01_catalog_migrations.test.ts
Set-Location ..\..

Write-Host "`n=== DONE ===" -ForegroundColor Green
