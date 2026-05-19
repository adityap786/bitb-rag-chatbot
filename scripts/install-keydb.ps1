# KeyDB Installation Script for Windows - Simplified
# Downloads and sets up KeyDB locally

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "KeyDB Installation for BiTB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Since KeyDB Windows binaries aren't readily available,
# we'll use Redis for Windows (MSI installer) as an alternative
# OR guide user to use WSL Redis

Write-Host "⚠ KeyDB official Windows binaries are not currently available" -ForegroundColor Yellow
Write-Host ""
Write-Host "Recommended alternatives:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option 1: Redis for Windows (Recommended for ease)" -ForegroundColor Yellow
Write-Host "  1. Download from: https://github.com/microsoftarchive/redis/releases" -ForegroundColor Gray
Write-Host "  2. Get Redis-x64-3.0.504.msi" -ForegroundColor Gray
Write-Host "  3. Install and it will run as a service" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2: Use WSL2 + Redis (Best performance)" -ForegroundColor Yellow
Write-Host "  1. Install WSL2: wsl --install" -ForegroundColor Gray
Write-Host "  2. In WSL: sudo apt update && sudo apt install redis-server" -ForegroundColor Gray
Write-Host "  3. Start: sudo service redis-server start" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 3: Memurai (Current fallback)" -ForegroundColor Yellow
Write-Host "  Download from: https://www.memurai.com/" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Would you like to download Redis for Windows MSI? (y/n)"

if ($choice -eq 'y') {
    $redisVersion = "3.0.504"
    $redisUrl = "https://github.com/microsoftarchive/redis/releases/download/win-$redisVersion/Redis-x64-$redisVersion.msi"
    $downloadPath = Join-Path $env:TEMP "Redis-Setup.msi"
    
    Write-Host ""
    Write-Host "Downloading Redis for Windows..." -ForegroundColor Yellow
    
    try {
        Invoke-WebRequest -Uri $redisUrl -OutFile $downloadPath -UseBasicParsing
        Write-Host "✓ Downloaded Redis installer" -ForegroundColor Green
        Write-Host ""
        Write-Host "Starting installer..." -ForegroundColor Yellow
        Write-Host "  - Accept defaults" -ForegroundColor Gray
        Write-Host "  - It will run on port 6379" -ForegroundColor Gray
        Write-Host "  - Installed as Windows service" -ForegroundColor Gray
        Write-Host ""
        
        Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$downloadPath`"" -Wait
        
        Write-Host "✓ Redis installation complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Redis should now be running on localhost:6379" -ForegroundColor Green
        
    }
    catch {
        Write-Host "✗ Failed to download Redis" -ForegroundColor Red
        Write-Host "Error: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please download manually from:" -ForegroundColor Yellow
        Write-Host "https://github.com/microsoftarchive/redis/releases" -ForegroundColor Cyan
    }
}
else {
    Write-Host ""
    Write-Host "Please install Redis/Memurai manually and then run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\start-all-services.ps1" -ForegroundColor Cyan
}
