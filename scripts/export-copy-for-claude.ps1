# Bản sao dự án thu gọn để gửi Claude (chỉ làm trên bản sao, không đụng dự án chính).
# Loại bỏ: node_modules, dist, .git, .turbo, .vscode, file log/err, .env
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$exportDir = Join-Path $root "Solar-export"
$zipPath = Join-Path $root "Solar-for-Claude.zip"

# Xóa bản sao/zip cũ nếu có (nằm trong project nên có quyền ghi)
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
if (Test-Path $exportDir) { Remove-Item -Recurse -Force $exportDir }

# Copy: loại trừ thư mục/file có thể tạo lại khi cài đặt/chạy
# /XD: thư mục bỏ qua (gồm Solar-export để tránh copy vào chính nó)
# /XF: file bỏ qua
& robocopy $root $exportDir /E /XD node_modules dist .git .vscode .turbo Solar-export /XF "*.log" "*.err" "*.pid" ".env" /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
$rc = $LASTEXITCODE
if ($rc -ge 8) { throw "Robocopy failed with exit code $rc" }

# Xóa script export trong bản sao (không cần trong zip gửi Claude)
$scriptInExport = Join-Path $exportDir "scripts\export-copy-for-claude.ps1"
if (Test-Path $scriptInExport) { Remove-Item -Force $scriptInExport }
$scriptOld = Join-Path $exportDir "scripts\export-for-claude.ps1"
if (Test-Path $scriptOld) { Remove-Item -Force $scriptOld }

# Thêm README hướng dẫn Claude cài đặt/chạy lại
@"
# Solar – bản sao thu gọn để xem code

Bản sao này đã bỏ **node_modules**, **.git**, **.turbo**, **dist**, file **.log/.err** và **.env** để zip nhẹ. Cài đặt và chạy lại như sau.

## Cài đặt

``````bash
npm ci
``````

## Chạy (ví dụ)

- Backend: ``npm run dev`` (hoặc script trong package.json).
- Test: ``npm test`` (hoặc ``npx turbo test`` nếu dùng monorepo).

## Cấu hình

- Copy ``.env.example`` thành ``.env`` và điền biến môi trường (DB, API keys…).

Dự án gốc: monorepo (packages/backend, packages/shared), dùng Turbo.
"@ | Set-Content -Path (Join-Path $exportDir "README-export.md") -Encoding UTF8

# Tạo zip
Compress-Archive -Path "$exportDir\*" -DestinationPath $zipPath -Force
$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Bản sao thu gon: $exportDir"
Write-Host "Zip de gui Claude: $zipPath ($sizeMB MB)"
Write-Host "Co the xoa thu muc Solar-export sau khi gui xong."
