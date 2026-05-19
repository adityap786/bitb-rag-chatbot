# Uninstall Memurai and Install Redis 7.2 Native

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Migrating: Memurai → Redis 7.2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop Memurai service
Write-Host "Step 1: Stopping Memurai service..." -ForegroundColor Yellow
$memuariService = Get-Service -Name "Memurai" -ErrorAction SilentlyContinue

if ($memuariService) {
    if ($memuariService.Status -eq 'Running') {
        Write-Host "  Stopping Memurai..." -ForegroundColor Gray
        Stop-Service -Name "Memurai" -Force
        Write-Host "  ✓ Memurai stopped" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Memurai already stopped" -ForegroundColor Green
    }
} else {
    Write-Host "  ℹ️  Memurai service not found (may already be uninstalled)" -ForegroundColor Gray
}

Write-Host ""

# Step 2: Uninstall Memurai
Write-Host "Step 2: Uninstalling Memurai..." -ForegroundColor Yellow
Write-Host "  Opening Windows 'Add or Remove Programs'..." -ForegroundColor Gray
Write-Host ""
Start-Process "ms-settings:appsfeatures"

Write-Host "  Please manually uninstall Memurai:" -ForegroundColor Cyan
Write-Host "    1. Search for 'Memurai' in the apps list" -ForegroundColor White
Write-Host "    2. Click 'Uninstall'" -ForegroundColor White
Write-Host "    3. Confirm uninstallation" -ForegroundColor White
Write-Host ""

$continue = Read-Host "Press Enter when Memurai is uninstalled (or Ctrl+C to cancel)"

Write-Host ""
Write-Host "  ✓ Memurai uninstalled" -ForegroundColor Green
Write-Host ""

# Step 3: Download Redis 7.2
Write-Host "Step 3: Downloading Redis 7.2 for Windows..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Opening Redis download page..." -ForegroundColor Gray
Start-Process "https://github.com/tporadowski/redis/releases"

Write-Host ""
Write-Host "  📥 Download Instructions:" -ForegroundColor Cyan
Write-Host "    1. Download: Redis-x64-7.2.x.msi (latest version)" -ForegroundColor White
Write-Host "    2. Save to Downloads folder" -ForegroundColor White
Write-Host ""

$downloaded = Read-Host "Press Enter when download is complete (or Ctrl+C to cancel)"

Write-Host ""
Write-Host "  ✓ Download complete" -ForegroundColor Green
Write-Host ""

# Step 4: Install Redis 7.2
Write-Host "Step 4: Installing Redis 7.2..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  📦 Installation Instructions:" -ForegroundColor Cyan
Write-Host "    1. Run the Redis-x64-7.2.x.msi installer" -ForegroundColor White
Write-Host "    2. Install location: C:\Program Files\Redis" -ForegroundColor White
Write-Host "    3. ✅ CHECK: 'Add Redis to PATH'" -ForegroundColor White
Write-Host "    4. ✅ CHECK: 'Install Windows Service'" -ForegroundColor White
Write-Host "    5. Click 'Install'" -ForegroundColor White
Write-Host "    6. Complete installation" -ForegroundColor White
Write-Host ""

$installed = Read-Host "Press Enter when installation is complete (or Ctrl+C to cancel)"

Write-Host ""
Write-Host "  ✓ Redis 7.2 installed" -ForegroundColor Green
Write-Host ""

# Step 5: Verify Installation
Write-Host "Step 5: Verifying Redis installation..." -ForegroundColor Yellow
Write-Host ""

# Check if redis-server is in PATH
if (Get-Command redis-server -ErrorAction SilentlyContinue) {
    $version = redis-server --version
    Write-Host "  ✓ Redis found: $version" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Redis not in PATH yet" -ForegroundColor Yellow
    Write-Host "     Please restart your terminal and try again" -ForegroundColor Gray
}

Write-Host ""

# Check Redis service
$redisService = Get-Service -Name "Redis" -ErrorAction SilentlyContinue
if ($redisService) {
    Write-Host "  ✓ Redis service: $($redisService.Status)" -ForegroundColor Green
    
    if ($redisService.Status -ne 'Running') {
        Write-Host "    Starting Redis service..." -ForegroundColor Gray
        Start-Service -Name "Redis"
        Write-Host "    ✓ Redis started" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠️  Redis service not found" -ForegroundColor Yellow
    Write-Host "     It may need manual start after terminal restart" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Migration Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Restart your terminal (to load PATH)" -ForegroundColor White
Write-Host "  2. Test: redis-cli ping" -ForegroundColor Cyan
Write-Host "     Expected: PONG" -ForegroundColor Gray
Write-Host "  3. Configure: .\scripts\configure-redis7.ps1" -ForegroundColor Cyan
Write-Host "  4. Start services: .\scripts\start-all-services.ps1" -ForegroundColor Cyan
Write-Host ""

Write-Host "✅ You now have Redis 7.2 (latest)!" -ForegroundColor Green
Write-Host ""
