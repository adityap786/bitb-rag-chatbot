# Configure Redis 7.2 with Optimal Settings for RAG Pipeline

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Redis 7.2 Configuration Utility" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find redis-cli
$cli = $null
if (Get-Command redis-cli -ErrorAction SilentlyContinue) {
    $cli = "redis-cli"
} elseif (Test-Path "C:\Program Files\Redis\redis-cli.exe") {
    $cli = "C:\Program Files\Redis\redis-cli.exe"
}

if (-not $cli) {
    Write-Host "✗ redis-cli not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Ensure Redis 7.2 is installed" -ForegroundColor White
    Write-Host "  2. Restart your terminal" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    exit 1
}

Write-Host "✓ Using: $cli" -ForegroundColor Green
Write-Host ""

# Test connection
Write-Host "Testing Redis connection..." -ForegroundColor Yellow
$pingResult = & $cli ping 2>&1

if ($pingResult -like "*PONG*") {
    Write-Host "  ✓ Redis is responding" -ForegroundColor Green
} else {
    Write-Host "  ✗ Redis not responding" -ForegroundColor Red
    Write-Host "  Make sure Redis service is running:" -ForegroundColor Yellow
    Write-Host "    Get-Service Redis" -ForegroundColor Cyan
    exit 1
}

Write-Host ""
Write-Host "Applying optimized configuration..." -ForegroundColor Yellow
Write-Host ""

# Apply settings
Write-Host "  Setting maxmemory to 2gb..." -ForegroundColor Gray
& $cli CONFIG SET maxmemory 2gb

Write-Host "  Setting maxmemory-policy to allkeys-lru..." -ForegroundColor Gray
& $cli CONFIG SET maxmemory-policy allkeys-lru

Write-Host "  Setting maxclients to 5000..." -ForegroundColor Gray
& $cli CONFIG SET maxclients 5000

Write-Host "  Setting timeout to 300..." -ForegroundColor Gray
& $cli CONFIG SET timeout 300

Write-Host "  Enabling RDB snapshots..." -ForegroundColor Gray
& $cli CONFIG SET save "900 1 300 10 60 10000"

Write-Host "  Saving configuration..." -ForegroundColor Gray
& $cli CONFIG REWRITE

Write-Host ""
Write-Host "✓ Configuration applied!" -ForegroundColor Green

# Verify and display
Write-Host ""
Write-Host "Current Configuration:" -ForegroundColor Cyan
Write-Host "  Redis Version: $(& $cli INFO server | Select-String 'redis_version')" -ForegroundColor White
Write-Host "  maxmemory: $(& $cli CONFIG GET maxmemory | Select-Object -Last 1)" -ForegroundColor White
Write-Host "  maxmemory-policy: $(& $cli CONFIG GET maxmemory-policy | Select-Object -Last 1)" -ForegroundColor White
Write-Host "  maxclients: $(& $cli CONFIG GET maxclients | Select-Object -Last 1)" -ForegroundColor White
Write-Host "  timeout: $(& $cli CONFIG GET timeout | Select-Object -Last 1)" -ForegroundColor White

Write-Host ""
Write-Host "✅ Redis 7.2 is ready for production!" -ForegroundColor Green
Write-Host ""
