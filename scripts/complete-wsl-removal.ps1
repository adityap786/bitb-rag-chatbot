# Complete WSL Removal - Run as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Complete WSL Removal" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Remove all distributions
Write-Host "Removing WSL distributions..." -ForegroundColor Yellow

wsl --shutdown
Start-Sleep -Seconds 2

$distros = @('Ubuntu', 'docker-desktop', 'docker-desktop-data', 'Ubuntu-20.04', 'Ubuntu-22.04')
foreach ($distro in $distros) {
    Write-Host "  Removing: $distro" -ForegroundColor Gray
    wsl --unregister $distro 2>$null
}

Write-Host "✓ Distributions removed" -ForegroundColor Green

# Remove .wslconfig
Write-Host ""
Write-Host "Removing .wslconfig..." -ForegroundColor Yellow
$wslConfig = "$env:USERPROFILE\.wslconfig"
if (Test-Path $wslConfig) {
    Remove-Item $wslConfig -Force
    Write-Host "✓ Removed .wslconfig" -ForegroundColor Green
}
else {
    Write-Host "✓ .wslconfig already removed" -ForegroundColor Green
}

# Disable WSL features
Write-Host ""
Write-Host "Disabling WSL features..." -ForegroundColor Yellow
Write-Host "  This will restore your display settings" -ForegroundColor Gray

try {
    Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart -ErrorAction Stop | Out-Null
    Write-Host "✓ Disabled WSL" -ForegroundColor Green
}
catch {
    Write-Host "⚠ WSL already disabled or could not disable" -ForegroundColor Yellow
}

try {
    Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -ErrorAction Stop | Out-Null
    Write-Host "✓ Disabled Virtual Machine Platform" -ForegroundColor Green
}
catch {
    Write-Host "⚠ Virtual Machine Platform already disabled" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WSL Completely Removed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Your display will be normal after restart" -ForegroundColor Green
Write-Host ""
Write-Host "⚠ RESTART REQUIRED" -ForegroundColor Yellow
Write-Host ""

$restart = Read-Host "Restart now? (y/n)"

if ($restart -eq 'y') {
    Write-Host ""
    Write-Host "Restarting in 5 seconds..." -ForegroundColor Yellow
    Write-Host "After restart, install Memurai: .\scripts\install-memurai.ps1" -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    Restart-Computer -Force
}
else {
    Write-Host ""
    Write-Host "Please restart manually" -ForegroundColor Yellow
    Write-Host "After restart: .\scripts\install-memurai.ps1" -ForegroundColor Cyan
}
