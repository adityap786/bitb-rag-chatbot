# Restore Windows Display Settings
# Fixes display scale issues caused by WSL

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Restoring Display Settings" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Method 1: Reset display scaling via registry
Write-Host "[Method 1] Resetting display scaling..." -ForegroundColor Yellow

try {
    # Get current DPI settings
    $dpiPath = "HKCU:\Control Panel\Desktop"
    $currentDPI = Get-ItemProperty -Path $dpiPath -Name "LogPixels" -ErrorAction SilentlyContinue
    
    Write-Host "Current scaling: $($currentDPI.LogPixels)" -ForegroundColor Gray
    
    # Reset to 100% (96 DPI)
    Set-ItemProperty -Path $dpiPath -Name "LogPixels" -Value 96 -Type DWord
    Set-ItemProperty -Path $dpiPath -Name "Win8DpiScaling" -Value 0 -Type DWord
    
    Write-Host "✓ Reset scaling to 100%" -ForegroundColor Green
}
catch {
    Write-Host "⚠ Could not modify registry (may need admin)" -ForegroundColor Yellow
}

# Method 2: Restart Explorer to apply
Write-Host ""
Write-Host "[Method 2] Restarting Windows Explorer..." -ForegroundColor Yellow

try {
    Stop-Process -Name explorer -Force
    Start-Sleep -Seconds 2
    Start-Process explorer
    Write-Host "✓ Explorer restarted" -ForegroundColor Green
}
catch {
    Write-Host "⚠ Explorer restart failed" -ForegroundColor Yellow
}

# Method 3: Uninstall WSL to prevent future issues
Write-Host ""
Write-Host "[Method 3] WSL Cleanup Options" -ForegroundColor Yellow
Write-Host ""
Write-Host "To permanently prevent WSL display issues:" -ForegroundColor White
Write-Host ""
Write-Host "Option A: Disable WSL (keeps it installed)" -ForegroundColor Cyan
Write-Host "  wsl --shutdown" -ForegroundColor Gray
Write-Host ""
Write-Host "Option B: Completely remove WSL" -ForegroundColor Cyan
Write-Host "  Run as Administrator:" -ForegroundColor Gray
Write-Host "  wsl --unregister Ubuntu" -ForegroundColor Gray
Write-Host "  Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Remove WSL completely? (y/n)"

if ($choice -eq 'y') {
    Write-Host ""
    Write-Host "Removing WSL..." -ForegroundColor Yellow
    
    # Shutdown WSL
    wsl --shutdown
    Start-Sleep -Seconds 2
    
    # Try to unregister distributions
    $distros = wsl --list --quiet 2>$null
    foreach ($distro in $distros) {
        if ($distro.Trim()) {
            Write-Host "  Removing: $($distro.Trim())" -ForegroundColor Gray
            wsl --unregister $distro.Trim() 2>$null
        }
    }
    
    Write-Host "✓ WSL distributions removed" -ForegroundColor Green
    Write-Host ""
    Write-Host "To completely uninstall WSL, run as Administrator:" -ForegroundColor Yellow
    Write-Host "  Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux" -ForegroundColor Cyan
    Write-Host "  Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform" -ForegroundColor Cyan
    Write-Host "  Restart-Computer" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Display Fix Applied" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Check your display settings in Windows" -ForegroundColor White
Write-Host "  2. Adjust manually if needed: Right-click Desktop → Display settings" -ForegroundColor White
Write-Host "  3. Install Redis 7.x for Windows (no WSL needed!)" -ForegroundColor White
Write-Host "     Run: .\scripts\install-redis7-windows.ps1" -ForegroundColor Cyan
Write-Host ""
