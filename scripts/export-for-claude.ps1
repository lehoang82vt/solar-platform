# Export project for Claude: copy without regeneratable artifacts, then zip.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$exportDir = Join-Path (Split-Path -Parent $root) "Solar-export"
$zipPath = Join-Path (Split-Path -Parent $root) "Solar-for-Claude.zip"

# Remove previous export/zip
if (Test-Path $exportDir) { Remove-Item -Recurse -Force $exportDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# Exclude: node_modules, dist, .git, .vscode, .turbo, .env, log/pid files
# Robocopy: /E = subdirs including empty, /XD = exclude dirs, /XF = exclude files
# /NFL /NDL = no file/dir list log, /NJH /NJS = no job header/summary
& robocopy $root $exportDir /E /XD node_modules dist .git .vscode .turbo /XF "*.log" "*.err" "*.pid" ".env" /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
# robocopy exit: 0=nothing copied, 1+ = some copied (we want 1-7)
$rc = $LASTEXITCODE
if ($rc -ge 8) { throw "Robocopy failed with exit code $rc" }

# Remove this script from export (optional)
$scriptInExport = Join-Path $exportDir "scripts\export-for-claude.ps1"
if (Test-Path $scriptInExport) { Remove-Item -Force $scriptInExport }

# Zip
Compress-Archive -Path "$exportDir\*" -DestinationPath $zipPath -Force
$size = (Get-Item $zipPath).Length / 1MB
Write-Host "Exported to: $zipPath"
Write-Host "Size: $([math]::Round($size, 2)) MB"
Write-Host "Export folder (can delete): $exportDir"
