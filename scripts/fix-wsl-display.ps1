# Fix WSL Display Scale Issues
# Disables WSLg (GUI apps) which can affect Windows scaling

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fixing WSL Display Issues" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create .wslconfig to disable GUI
$wslConfigPath = "$env:USERPROFILE\.wslconfig"
$wslConfig = @"
[wsl2]
# Disable GUI applications to prevent display scaling issues
guiApplications=false

# Memory and CPU limits (optional)
memory=4GB
processors=2
"@

Write-Host "Creating WSL configuration..." -ForegroundColor Yellow
$wslConfig | Set-Content $wslConfigPath -Force
Write-Host "✓ Created .wslconfig at: $wslConfigPath" -ForegroundColor Green

# Shutdown WSL to apply changes
Write-Host ""
Write-Host "Shutting down WSL to apply changes..." -ForegroundColor Yellow
wsl --shutdown
Start-Sleep -Seconds 3
Write-Host "✓ WSL shut down" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fix Applied!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Changes:" -ForegroundColor White
Write-Host "  • Disabled WSL GUI applications" -ForegroundColor Gray
Write-Host "  • This should prevent display scaling issues" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Check your display settings (should be back to normal)" -ForegroundColor Cyan
Write-Host "  2. If still having issues, consider using Memurai instead" -ForegroundColor Cyan
Write-Host "     See: docs\FIX_WSL_DISPLAY.md" -ForegroundColor Gray
Write-Host ""
