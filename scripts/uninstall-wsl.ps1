# Uninstall WSL and Restore Display Settings
# Run as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Uninstalling WSL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Shutdown WSL
Write-Host "Shutting down WSL..." -ForegroundColor Yellow
wsl --shutdown
Start-Sleep -Seconds 2
Write-Host "✓ WSL shut down" -ForegroundColor Green

# Unregister all distributions
Write-Host ""
Write-Host "Removing WSL distributions..." -ForegroundColor Yellow
$distros = wsl --list --quiet 2>&1
if ($distros) {
    foreach ($distro in $distros) {
        $distroName = $distro.Trim()
        if ($distroName -and $distroName -notmatch "Windows Subsystem") {
            Write-Host "  Removing: $distroName" -ForegroundColor Gray
            wsl --unregister $distroName 2>$null
        }
    }
    Write-Host "✓ Distributions removed" -ForegroundColor Green
}
else {
    Write-Host "✓ No distributions found" -ForegroundColor Green
}

# Remove .wslconfig
Write-Host ""
Write-Host "Removing WSL configuration..." -ForegroundColor Yellow
$wslConfig = "$env:USERPROFILE\.wslconfig"
if (Test-Path $wslConfig) {
    Remove-Item $wslConfig -Force
    Write-Host "✓ Removed .wslconfig" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Administrator Action Required" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "To completely uninstall WSL, run PowerShell as Administrator:" -ForegroundColor White
Write-Host ""
Write-Host "Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart" -ForegroundColor Cyan
Write-Host "Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then restart your computer" -ForegroundColor White
Write-Host ""

$runNow = Read-Host "Run uninstall commands now? (requires admin, y/n)"

if ($runNow -eq 'y') {
    Write-Host ""
    Write-Host "Disabling WSL features..." -ForegroundColor Yellow
    
    Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart
    Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart
    
    Write-Host "✓ WSL features disabled" -ForegroundColor Green
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "WSL Uninstalled Successfully" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠ Restart required to complete uninstallation" -ForegroundColor Yellow
    Write-Host ""
    
    $restart = Read-Host "Restart now? (y/n)"
    if ($restart -eq 'y') {
        Restart-Computer -Force
    }
    else {
        Write-Host ""
        Write-Host "Please restart manually to complete WSL removal" -ForegroundColor Yellow
    }
}
else {
    Write-Host ""
    Write-Host "WSL distributions removed but features not disabled" -ForegroundColor Yellow
    Write-Host "Your display should be back to normal now" -ForegroundColor Green
}
