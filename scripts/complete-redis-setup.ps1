# Post-Restart Redis Setup
# Run this after restarting from WSL2 installation

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Continuing WSL2 + Redis Setup" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Wait for WSL to be ready
Write-Host "Waiting for WSL to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check WSL
$wslStatus = wsl --list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WSL is setting up. This may take a minute..." -ForegroundColor Yellow
    Write-Host "Once you see 'Enter new UNIX username:', create your account" -ForegroundColor Gray
    Write-Host ""
    wsl
    Write-Host ""
    Write-Host "WSL setup complete!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting Redis installation..." -ForegroundColor Cyan
Write-Host ""

# Install Redis
$installCommands = @"
sudo apt update && \
sudo apt install -y redis-server && \
sudo sed -i 's/bind 127.0.0.1 ::1/bind 0.0.0.0/' /etc/redis/redis.conf && \
sudo sed -i 's/protected-mode yes/protected-mode no/' /etc/redis/redis.conf && \
sudo service redis-server start && \
redis-cli ping
"@

Write-Host "Installing Redis (this will take 2-3 minutes)..." -ForegroundColor Yellow
$result = wsl bash -c $installCommands

if ($result -match "PONG") {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "✓ Redis Installation Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Redis is now running on localhost:6379" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Start your services: .\scripts\start-all-services.ps1" -ForegroundColor Cyan
    Write-Host "  2. Test onboarding flow!" -ForegroundColor Cyan
    Write-Host ""
}
else {
    Write-Host "Redis installation completed, checking status..." -ForegroundColor Yellow
    wsl sudo service redis-server status
}
