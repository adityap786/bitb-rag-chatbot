# Remove WSL Completely - Run as Administrator
Write-Host "Removing WSL and Virtualization Features..." -ForegroundColor Yellow

# Unregister all WSL distros
Write-Host "`nStep 1: Unregistering WSL distributions..." -ForegroundColor Cyan
$distros = wsl --list --quiet
foreach ($distro in $distros) {
    if ($distro) {
        Write-Host "  Unregistering: $distro" -ForegroundColor Gray
        wsl --unregister $distro
    }
}

# Disable WSL features
Write-Host "`nStep 2: Disabling WSL features..." -ForegroundColor Cyan
dism.exe /online /disable-feature /featurename:Microsoft-Windows-Subsystem-Linux /norestart
dism.exe /online /disable-feature /featurename:VirtualMachinePlatform /norestart

# Optional: Disable Hyper-V (if you don't use it)
Write-Host "`nStep 3: Disabling Hyper-V..." -ForegroundColor Cyan
dism.exe /online /disable-feature /featurename:Microsoft-Hyper-V-All /norestart

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "WSL removal complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nIMPORTANT: You MUST restart your computer now." -ForegroundColor Yellow
Write-Host "After restart, your display and admin settings should be restored." -ForegroundColor Yellow
Write-Host "`nPress any key to restart now, or close this window to restart later..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
Restart-Computer -Force
