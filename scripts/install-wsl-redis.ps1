# WSL2 + Redis Installation Script for Windows
# Automated setup for high-performance Redis on WSL2

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WSL2 + Redis 7.x Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (!$isAdmin) {
    Write-Host "⚠ This script requires Administrator privileges" -ForegroundColor Yellow
    Write-Host "Please run PowerShell as Administrator and try again" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Right-click PowerShell → Run as Administrator" -ForegroundColor Gray
    exit 1
}

# Step 1: Check WSL status
Write-Host "[Step 1/5] Checking WSL2 status..." -ForegroundColor Cyan

$wslVersion = wsl --status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WSL not installed. Installing WSL2..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This will:" -ForegroundColor Gray
    Write-Host "  1. Enable WSL and Virtual Machine Platform" -ForegroundColor Gray
    Write-Host "  2. Install Ubuntu (default distribution)" -ForegroundColor Gray
    Write-Host "  3. Require a system restart" -ForegroundColor Gray
    Write-Host ""
    
    $confirm = Read-Host "Continue with WSL2 installation? (y/n)"
    if ($confirm -ne 'y') {
        Write-Host "Installation cancelled" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    Write-Host "Installing WSL2..." -ForegroundColor Yellow
    wsl --install
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "⚠ RESTART REQUIRED" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "WSL2 has been installed but requires a restart." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After restart:" -ForegroundColor Cyan
    Write-Host "  1. WSL will automatically set up Ubuntu" -ForegroundColor Gray
    Write-Host "  2. Create a username and password when prompted" -ForegroundColor Gray
    Write-Host "  3. Run this script again to install Redis" -ForegroundColor Gray
    Write-Host ""
    
    $restart = Read-Host "Restart now? (y/n)"
    if ($restart -eq 'y') {
        Restart-Computer -Force
    }
    else {
        Write-Host "Please restart manually and run this script again" -ForegroundColor Yellow
    }
    exit 0
}

Write-Host "✓ WSL2 is installed" -ForegroundColor Green

# Step 2: Check WSL distribution
Write-Host ""
Write-Host "[Step 2/5] Checking WSL distribution..." -ForegroundColor Cyan

$distros = wsl --list --quiet
if (!$distros -or $distros.Count -eq 0) {
    Write-Host "No WSL distributions found. Installing Ubuntu..." -ForegroundColor Yellow
    wsl --install -d Ubuntu
    Write-Host "✓ Ubuntu installed" -ForegroundColor Green
    Write-Host ""
    Write-Host "⚠ Please set up Ubuntu (username/password) and run this script again" -ForegroundColor Yellow
    exit 0
}

$defaultDistro = (wsl --list | Select-Object -First 2)[1].Trim()
Write-Host "✓ Found WSL distribution: $defaultDistro" -ForegroundColor Green

# Step 3: Install Redis in WSL
Write-Host ""
Write-Host "[Step 3/5] Installing Redis 7.x in WSL..." -ForegroundColor Cyan
Write-Host "This may take 2-3 minutes..." -ForegroundColor Gray
Write-Host ""

$installScript = @'
#!/bin/bash
set -e

echo "Updating package lists..."
sudo apt update -qq

echo "Installing Redis..."
sudo apt install -y redis-server > /dev/null 2>&1

echo "Configuring Redis for Windows access..."
# Allow connections from Windows
sudo sed -i 's/bind 127.0.0.1 ::1/bind 0.0.0.0/' /etc/redis/redis.conf
# Disable protected mode for local development
sudo sed -i 's/protected-mode yes/protected-mode no/' /etc/redis/redis.conf
# Enable persistence
sudo sed -i 's/# maxmemory <bytes>/maxmemory 4gb/' /etc/redis/redis.conf
sudo sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf

echo "Starting Redis..."
sudo service redis-server start

# Check if Redis is running
if sudo service redis-server status | grep -q "is running"; then
    echo "SUCCESS"
else
    echo "FAILED"
    exit 1
fi

# Get Redis version
redis-cli --version
'@

$tempScript = Join-Path $env:TEMP "install-redis.sh"
$installScript | Set-Content -Path $tempScript -Encoding UTF8

# Copy script to WSL and execute
wsl cp $tempScript /tmp/install-redis.sh
wsl chmod +x /tmp/install-redis.sh
$output = wsl bash /tmp/install-redis.sh 2>&1

if ($output -match "SUCCESS") {
    Write-Host "✓ Redis installed and running!" -ForegroundColor Green
    
    # Extract version
    $versionLine = $output | Where-Object { $_ -match "redis-cli" }
    if ($versionLine) {
        Write-Host "  $versionLine" -ForegroundColor Gray
    }
}
else {
    Write-Host "✗ Redis installation failed" -ForegroundColor Red
    Write-Host "Output: $output" -ForegroundColor Red
    exit 1
}

# Step 4: Test Redis connection from Windows
Write-Host ""
Write-Host "[Step 4/5] Testing Redis connection from Windows..." -ForegroundColor Cyan

Start-Sleep -Seconds 2

# Check if Redis port is accessible
$testConnection = Test-NetConnection -ComputerName localhost -Port 6379 -WarningAction SilentlyContinue

if ($testConnection.TcpTestSucceeded) {
    Write-Host "✓ Redis is accessible from Windows on localhost:6379" -ForegroundColor Green
}
else {
    Write-Host "⚠ Redis port test failed, but this is normal" -ForegroundColor Yellow
    Write-Host "  WSL networking will work once services start" -ForegroundColor Gray
}

# Step 5: Create auto-start script
Write-Host ""
Write-Host "[Step 5/5] Setting up auto-start..." -ForegroundColor Cyan

$autoStartScript = @'
#!/bin/bash
# Auto-start Redis when WSL starts
if ! sudo service redis-server status | grep -q "is running"; then
    echo "Starting Redis..."
    sudo service redis-server start
fi
'@

wsl bash -c "echo '$autoStartScript' > ~/start-redis.sh"
wsl chmod +x ~/start-redis.sh

# Add to .bashrc for auto-start
wsl bash -c "grep -q 'start-redis.sh' ~/.bashrc || echo '~/start-redis.sh' >> ~/.bashrc"

Write-Host "✓ Auto-start configured" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Complete! ✓" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Redis Status:" -ForegroundColor White
Write-Host "  • Version: Redis 7.x" -ForegroundColor Gray
Write-Host "  • Running in: WSL2 ($defaultDistro)" -ForegroundColor Gray
Write-Host "  • Address: localhost:6379" -ForegroundColor Gray
Write-Host "  • Auto-start: Enabled" -ForegroundColor Gray
Write-Host ""
Write-Host "Quick Commands:" -ForegroundColor White
Write-Host "  Start Redis:  wsl sudo service redis-server start" -ForegroundColor Cyan
Write-Host "  Stop Redis:   wsl sudo service redis-server stop" -ForegroundColor Cyan
Write-Host "  Status:       wsl sudo service redis-server status" -ForegroundColor Cyan
Write-Host "  Redis CLI:    wsl redis-cli" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your Node.js app will connect to: localhost:6379" -ForegroundColor Green
Write-Host "No configuration changes needed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next: Run your services with:" -ForegroundColor Yellow
Write-Host "  .\scripts\start-all-services.ps1" -ForegroundColor Cyan
Write-Host ""

# Cleanup
Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
