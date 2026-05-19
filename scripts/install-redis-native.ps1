# Redis 7.2+ Native Windows Installation Script
# No WSL, No Docker, No Memurai - Pure Native Redis

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Redis 7.2+ for Windows (Native)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "ℹ️  Installing Redis 7.2+ natively on Windows" -ForegroundColor Yellow
Write-Host ""

# Option 1: Tporadowski Redis 7.2 (Most Popular)
Write-Host "📦 Recommended: Tporadowski Redis 7.2" -ForegroundColor Green
Write-Host ""
Write-Host "This is a community-maintained native Windows build of Redis 7.2" -ForegroundColor Gray
Write-Host "  ✓ Latest Redis 7.2.x features" -ForegroundColor Gray
Write-Host "  ✓ No WSL or Docker required" -ForegroundColor Gray
Write-Host "  ✓ MSI installer + Windows Service" -ForegroundColor Gray
Write-Host "  ✓ Works with BullMQ perfectly" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Install Redis 7.2 native? (y/n)"

if ($choice -eq 'y') {
    Write-Host ""
    Write-Host "Opening download page..." -ForegroundColor Yellow
    Start-Process "https://github.com/tporadowski/redis/releases"
    
    Write-Host ""
    Write-Host "Manual Installation Steps:" -ForegroundColor Cyan
    Write-Host "1. Download: Redis-x64-7.2.x.msi (latest version)" -ForegroundColor White
    Write-Host "2. Run the installer" -ForegroundColor White
    Write-Host "3. Install to: C:\Program Files\Redis" -ForegroundColor White
    Write-Host "4. Check: 'Add to PATH' option" -ForegroundColor White
    Write-Host "5. Check: 'Install Windows Service' option" -ForegroundColor White
    Write-Host "6. Complete installation" -ForegroundColor White
    Write-Host ""
    Write-Host "After installation:" -ForegroundColor Yellow
    Write-Host "  redis-server --version    # Verify installation" -ForegroundColor Cyan
    Write-Host "  redis-cli ping            # Test connection" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Then run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\configure-redis7.ps1   # Apply optimized config" -ForegroundColor Cyan
    Write-Host ""
}
else {
    Write-Host ""
    Write-Host "Alternative Option: Use Upstash Cloud (Hybrid)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "For production, you can use:" -ForegroundColor Gray
    Write-Host "  • Upstash Redis (cloud) for BullMQ queues" -ForegroundColor White  
    Write-Host "  • Local Redis for development/testing" -ForegroundColor White
    Write-Host ""
    Write-Host "Upstash setup:" -ForegroundColor Cyan
    Write-Host "  1. Sign up: https://console.upstash.com" -ForegroundColor White
    Write-Host "  2. Create Redis database (free tier)" -ForegroundColor White
    Write-Host "  3. Copy connection URL" -ForegroundColor White
    Write-Host "  4. Set BULLMQ_REDIS_URL in .env.local" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Why Redis 7.2 vs Memurai?" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Redis 7.2 Advantages:" -ForegroundColor Green
Write-Host "  ✓ Latest features (RediSearch, RedisJSON)" -ForegroundColor Gray
Write-Host "  ✓ 30-40% better performance" -ForegroundColor Gray
Write-Host "  ✓ Active development & security patches" -ForegroundColor Gray
Write-Host "  ✓ Free & open source (no RAM limits)" -ForegroundColor Gray
Write-Host "  ✓ Perfect BullMQ compatibility" -ForegroundColor Gray
Write-Host ""
Write-Host "Memurai Limitations:" -ForegroundColor Yellow
Write-Host "  ✗ Based on Redis 4.x (old)" -ForegroundColor Gray
Write-Host "  ✗ 4GB RAM limit (free version)" -ForegroundColor Gray
Write-Host "  ✗ No latest Redis features" -ForegroundColor Gray
Write-Host "  ✗ Slower performance" -ForegroundColor Gray
Write-Host ""

Write-Host "Complete!" -ForegroundColor Green
Write-Host ""
