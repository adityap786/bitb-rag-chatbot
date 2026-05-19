# Memurai Installation Script (Simpler Alternative to WSL)
# Memurai is a Redis-compatible database for Windows

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Memurai Installation Guide" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Memurai is the recommended Redis solution for Windows" -ForegroundColor Green
Write-Host "✓ No WSL required" -ForegroundColor Gray
Write-Host "✓ No display issues" -ForegroundColor Gray
Write-Host "✓ Simple 1-click installation" -ForegroundColor Gray
Write-Host "✓ Auto-starts on boot" -ForegroundColor Gray
Write-Host ""

Write-Host "Installation Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Visit: https://www.memurai.com/" -ForegroundColor White
Write-Host "2. Click: 'Download Memurai Developer'" -ForegroundColor White
Write-Host "3. Run the installer (MemuraiDeveloper-Setup.exe)" -ForegroundColor White
Write-Host "4. Accept defaults and install" -ForegroundColor White
Write-Host "5. Memurai will run automatically on port 6379" -ForegroundColor White
Write-Host ""

$download = Read-Host "Open Memurai download page? (y/n)"

if ($download -eq 'y') {
    Start-Process "https://www.memurai.com/"
    Write-Host ""
    Write-Host "Opening browser..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "After installation:" -ForegroundColor Yellow
    Write-Host "  Run: .\scripts\start-all-services.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "The script will automatically detect Memurai!" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "Manual download:" -ForegroundColor Yellow
    Write-Host "  https://www.memurai.com/" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host ""
Write-Host "Alternative - Redis for Windows MSI:" -ForegroundColor Gray
Write-Host "  https://github.com/microsoftarchive/redis/releases/download/win-3.0.504/Redis-x64-3.0.504.msi" -ForegroundColor DarkGray
Write-Host ""
