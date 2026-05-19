# Complete Memurai/Redis Configuration Script
# Applies optimized settings for RAG pipeline

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Memurai Configuration Utility" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Memurai is installed
$memuariService = Get-Service -Name "Memurai" -ErrorAction SilentlyContinue

if (-not $memuariService) {
    Write-Host "✗ Memurai service not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Memurai first:" -ForegroundColor Yellow
    Write-Host "  .\scripts\install-memurai.ps1" -ForegroundColor Cyan
    exit 1
}

Write-Host "✓ Memurai service found: $($memuariService.Status)" -ForegroundColor Green
Write-Host ""

# Find Memurai installation path
$memuariPath = "C:\Program Files\Memurai"
if (-not (Test-Path $memuariPath)) {
    Write-Host "⚠️  Standard Memurai path not found, checking common locations..." -ForegroundColor Yellow
    $possiblePaths = @(
        "C:\Memurai",
        "C:\Program Files (x86)\Memurai",
        "$env:ProgramFiles\Memurai"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $memuariPath = $path
            break
        }
    }
}

if (Test-Path $memuariPath) {
    Write-Host "✓ Memurai installation found: $memuariPath" -ForegroundColor Green
    
    # Add to PATH if not already there
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$memuariPath*") {
        Write-Host ""
        Write-Host "Adding Memurai to PATH..." -ForegroundColor Yellow
        [Environment]::SetEnvironmentVariable(
            "Path",
            "$currentPath;$memuariPath",
            "User"
        )
        
        # Also add to current session
        $env:Path += ";$memuariPath"
        Write-Host "✓ Added to PATH (restart terminal for persistence)" -ForegroundColor Green
    } else {
        Write-Host "✓ Already in PATH" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  Could not locate Memurai installation directory" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Applying Optimized Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if memurai-cli or redis-cli is available
$cli = $null
if (Get-Command memurai-cli -ErrorAction SilentlyContinue) {
    $cli = "memurai-cli"
} elseif (Get-Command redis-cli -ErrorAction SilentlyContinue) {
    $cli = "redis-cli"
} else {
    Write-Host "⚠️  memurai-cli not found in current session" -ForegroundColor Yellow
    Write-Host "   Trying direct path..." -ForegroundColor Gray
    
    $cliPath = Join-Path $memuariPath "memurai-cli.exe"
    if (Test-Path $cliPath) {
        $cli = $cliPath
    }
}

if ($cli) {
    Write-Host "Using CLI: $cli" -ForegroundColor Gray
    Write-Host ""
    
    # Test connection
    $pingResult = & $cli ping 2>&1
    if ($pingResult -like "*PONG*") {
        Write-Host "✓ Memurai is responding" -ForegroundColor Green
        Write-Host ""
        
        # Apply optimizations
        Write-Host "Applying optimization settings..." -ForegroundColor Yellow
        Write-Host ""
        
        # 1. Set maxmemory (2GB)
        Write-Host "  Setting maxmemory to 2gb..." -ForegroundColor Gray
        & $cli CONFIG SET maxmemory 2gb | Out-Null
        
        # 2. Set eviction policy
        Write-Host "  Setting maxmemory-policy to allkeys-lru..." -ForegroundColor Gray
        & $cli CONFIG SET maxmemory-policy allkeys-lru | Out-Null
        
        # 3. Set max clients
        Write-Host "  Setting maxclients to 5000..." -ForegroundColor Gray
        & $cli CONFIG SET maxclients 5000 | Out-Null
        
        # 4. Set timeout
        Write-Host "  Setting timeout to 300..." -ForegroundColor Gray
        & $cli CONFIG SET timeout 300 | Out-Null
        
        # 5. Save configuration
        Write-Host "  Saving configuration..." -ForegroundColor Gray
        & $cli CONFIG REWRITE | Out-Null
        
        Write-Host ""
        Write-Host "✓ Configuration applied successfully!" -ForegroundColor Green
        
        # Verify settings
        Write-Host ""
        Write-Host "Current Configuration:" -ForegroundColor Cyan
        Write-Host "  maxmemory: $(& $cli CONFIG GET maxmemory | Select-Object -Last 1)" -ForegroundColor White
        Write-Host "  maxmemory-policy: $(& $cli CONFIG GET maxmemory-policy | Select-Object -Last 1)" -ForegroundColor White
        Write-Host "  maxclients: $(& $cli CONFIG GET maxclients | Select-Object -Last 1)" -ForegroundColor White
        Write-Host "  timeout: $(& $cli CONFIG GET timeout | Select-Object -Last 1)" -ForegroundColor White
        
    } else {
        Write-Host "✗ Could not connect to Memurai" -ForegroundColor Red
        Write-Host "  Make sure Memurai service is running" -ForegroundColor Yellow
        Write-Host "  (Check Services or run: Get-Service Memurai)" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  CLI tool not available yet" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Manual configuration required:" -ForegroundColor Yellow
    Write-Host "1. Restart your terminal" -ForegroundColor White
    Write-Host "2. Run this script again" -ForegroundColor White
    Write-Host "   Or manually configure via Memurai config file" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuration Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Restart terminal (to load PATH changes)" -ForegroundColor White
Write-Host "  2. Test: memurai-cli ping" -ForegroundColor Cyan
Write-Host "  3. Start services: .\scripts\start-all-services.ps1" -ForegroundColor Cyan
Write-Host ""
