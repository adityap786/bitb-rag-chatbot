# Redis 7.x for Windows - Simplified Installation

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Redis 7.x for Windows Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$REDIS_VERSION = "7.2.4.1"
$REDIS_URL = "https://github.com/tporadowski/redis/releases/download/v$REDIS_VERSION/Redis-x64-$REDIS_VERSION.zip"
$INSTALL_DIR = Join-Path $PSScriptRoot "..\redis7"
$DOWNLOAD_PATH = Join-Path $env:TEMP "Redis-7.zip"

# Create directory
if (!(Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
    Write-Host "✓ Created directory: $INSTALL_DIR" -ForegroundColor Green
}

# Download
Write-Host "Downloading Redis 7.2.4..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $REDIS_URL -OutFile $DOWNLOAD_PATH -UseBasicParsing
Write-Host "✓ Downloaded" -ForegroundColor Green

# Extract  
Write-Host "Extracting..." -ForegroundColor Yellow
Expand-Archive -Path $DOWNLOAD_PATH -DestinationPath $INSTALL_DIR -Force
Write-Host "✓ Extracted" -ForegroundColor Green

# Cleanup
Remove-Item $DOWNLOAD_PATH -Force -ErrorAction SilentlyContinue

# Find executable
$redisExe = Get-ChildItem -Path $INSTALL_DIR -Filter "redis-server.exe" -Recurse | Select-Object -First 1
$redisPath = $redisExe.FullName
$redisDir = $redisExe.DirectoryName

Write-Host "✓ Redis location: $redisPath" -ForegroundColor Green

# Create config
Write-Host "Creating configuration..." -ForegroundColor Yellow
$configContent = @"
bind 127.0.0.1
port 6379
maxmemory 4gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
logfile redis.log
protected-mode no
"@

$configPath = Join-Path $redisDir "redis.conf"
$configContent | Set-Content $configPath
Write-Host "✓ Config created" -ForegroundColor Green

# Save path
$pathFile = Join-Path $PSScriptRoot "..\config\.redis7-path"
$redisPath | Set-Content $pathFile

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Redis 7.2.4 installed at:" -ForegroundColor White
Write-Host "  $redisPath" -ForegroundColor Gray
Write-Host ""
Write-Host "To start Redis:" -ForegroundColor Yellow
Write-Host "  cd `"$redisDir`"" -ForegroundColor Cyan
Write-Host "  .\redis-server.exe redis.conf" -ForegroundColor Cyan
Write-Host ""
Write-Host "Or use:" -ForegroundColor Yellow
Write-Host "  .\scripts\start-all-services.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Redis:" -ForegroundColor Yellow
Write-Host "  cd `"$redisDir`"" -ForegroundColor Cyan
Write-Host "  .\redis-cli.exe ping" -ForegroundColor Cyan
Write-Host ""
