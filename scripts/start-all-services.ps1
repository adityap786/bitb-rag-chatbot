# Start All Services for Local Development
# This script starts all the services needed for testing the onboarding flow locally

param(
    [switch]$SkipRedis,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting All Services for BITB RAG App" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Helper function to check if port is in use
function Test-PortInUse {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    return $null -ne $connection
}

# Helper function to wait for service to be ready
function Wait-ForService {
    param(
        [string]$Name,
        [string]$Url,
        [int]$MaxRetries = 30,
        [int]$DelaySeconds = 2
    )
    
    Write-Host "Waiting for $Name to be ready..." -ForegroundColor Yellow
    for ($i = 0; $i -lt $MaxRetries; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "✓ $Name is ready!" -ForegroundColor Green
                return $true
            }
        }
        catch {
            # Service not ready yet
        }
        Start-Sleep -Seconds $DelaySeconds
    }
    Write-Host "✗ $Name failed to start within timeout" -ForegroundColor Red
    return $false
}

# Track PIDs for cleanup
$script:servicePids = @{}

# Create .tmp directory for logs
$tmpDir = Join-Path $repoRoot ".tmp"
if (!(Test-Path $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

Write-Host "Logs will be stored in: $tmpDir" -ForegroundColor Gray
Write-Host ""

# ============================================
# 1. Check/Start KeyDB (Redis replacement)
# ============================================
if (!$SkipRedis) {
    Write-Host "[1/5] Checking KeyDB/Redis..." -ForegroundColor Cyan
    
    if (Test-PortInUse -Port 6379) {
        Write-Host "✓ Redis/KeyDB is already running on port 6379" -ForegroundColor Green
    }
    else {
        Write-Host "Attempting to start KeyDB..." -ForegroundColor Yellow
        
        # Try to find KeyDB installation
        $keydbPathFile = Join-Path $repoRoot "config\.keydb-path"
        $keydbExe = $null
        
        if (Test-Path $keydbPathFile) {
            $keydbExe = Get-Content $keydbPathFile -Raw | ForEach-Object { $_.Trim() }
            if (!(Test-Path $keydbExe)) {
                $keydbExe = $null
            }
        }
        
        # Search common locations if not found
        if (!$keydbExe) {
            $keydbSearchPaths = @(
                (Join-Path $repoRoot "keydb\keydb-server.exe"),
                (Join-Path $repoRoot "keydb\bin\keydb-server.exe"),
                "C:\Program Files\KeyDB\keydb-server.exe",
                "C:\KeyDB\keydb-server.exe"
            )
            
            $keydbExe = $keydbSearchPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
        }
        
        if ($keydbExe) {
            Write-Host "Found KeyDB at: $keydbExe" -ForegroundColor Gray
            
            $configFile = Join-Path $repoRoot "config\keydb.conf"
            $keydbDir = Split-Path $keydbExe
            $keydbArgs = @()
            
            if (Test-Path $configFile) {
                # Copy config to KeyDB directory
                $localConfig = Join-Path $keydbDir "keydb.conf"
                Copy-Item $configFile $localConfig -Force
                $keydbArgs = @($localConfig)
                Write-Host "Using config: $configFile" -ForegroundColor Gray
            }
            
            $proc = Start-Process -FilePath $keydbExe -ArgumentList $args -WorkingDirectory $keydbDir -PassThru -WindowStyle Minimized
            $script:servicePids['keydb'] = $proc.Id
            Start-Sleep -Seconds 3
            
            if (Test-PortInUse -Port 6379) {
                Write-Host "✓ KeyDB started successfully (PID: $($proc.Id))" -ForegroundColor Green
            }
            else {
                Write-Host "✗ KeyDB failed to start" -ForegroundColor Red
                Write-Host "Check log at: $keydbDir\keydb.log" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "⚠ KeyDB not found. Attempting installation..." -ForegroundColor Yellow
            
            $installScript = Join-Path $PSScriptRoot "install-keydb.ps1"
            if (Test-Path $installScript) {
                Write-Host "Running KeyDB installation script..." -ForegroundColor Yellow
                & $installScript
                
                # Retry detection after installation
                if (Test-Path $keydbPathFile) {
                    $keydbExe = Get-Content $keydbPathFile -Raw | ForEach-Object { $_.Trim() }
                    if (Test-Path $keydbExe) {
                        Write-Host "Retrying KeyDB startup after installation..." -ForegroundColor Yellow
                        $configFile = Join-Path $repoRoot "config\keydb.conf"
                        $keydbDir = Split-Path $keydbExe
                        $keydbArgs = @()
                        if (Test-Path $configFile) {
                            $localConfig = Join-Path $keydbDir "keydb.conf"
                            Copy-Item $configFile $localConfig -Force
                            $keydbArgs = @($localConfig)
                        }
                        $proc = Start-Process -FilePath $keydbExe -ArgumentList $keydbArgs -WorkingDirectory $keydbDir -PassThru -WindowStyle Minimized
                        $script:servicePids['keydb'] = $proc.Id
                        Start-Sleep -Seconds 3
                        
                        if (Test-PortInUse -Port 6379) {
                            Write-Host "✓ KeyDB started successfully after installation (PID: $($proc.Id))" -ForegroundColor Green
                        }
                    }
                }
            }
            
            if (!(Test-PortInUse -Port 6379)) {
                Write-Host "✗ Could not start Redis/KeyDB" -ForegroundColor Red
                Write-Host ""
                Write-Host "Manual installation options:" -ForegroundColor Yellow
                Write-Host "  1. Run: .\scripts\install-keydb.ps1" -ForegroundColor Gray
                Write-Host "  2. Or install Memurai: https://www.memurai.com/" -ForegroundColor Gray
                Write-Host "  3. Or use WSL Redis: wsl sudo service redis-server start" -ForegroundColor Gray
                Write-Host ""
                
                $continue = Read-Host "Continue without Redis/KeyDB? (y/n)"
                if ($continue -ne 'y') {
                    exit 1
                }
            }
        }
    }
    Write-Host ""
}

# ============================================
# 2. Start BGE Embedding Service (Python)
# ============================================
Write-Host "[2/5] Starting BGE Embedding Service..." -ForegroundColor Cyan

$embeddingPort = 8000
if (Test-PortInUse -Port $embeddingPort) {
    Write-Host "✓ Embedding service already running on port $embeddingPort" -ForegroundColor Green
}
else {
    $pythonExe = Join-Path $repoRoot "langcache.venv\Scripts\python.exe"
    $serviceDir = Join-Path $repoRoot "services\bge_embedding_service"
    
    if (!(Test-Path $pythonExe)) {
        Write-Host "✗ Python virtual environment not found at: $pythonExe" -ForegroundColor Red
        Write-Host "Please create the virtual environment first:" -ForegroundColor Yellow
        Write-Host "  python -m venv langcache.venv" -ForegroundColor Gray
        Write-Host "  .\langcache.venv\Scripts\Activate.ps1" -ForegroundColor Gray
        Write-Host "  pip install fastapi uvicorn sentence-transformers" -ForegroundColor Gray
        exit 1
    }
    
    $outLog = Join-Path $tmpDir "bge_embedding_service.out.log"
    $errLog = Join-Path $tmpDir "bge_embedding_service.err.log"
    
    $proc = Start-Process -FilePath $pythonExe -ArgumentList @("-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "$embeddingPort") -WorkingDirectory $serviceDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden
    
    $script:servicePids['embedding'] = $proc.Id
    Write-Host "✓ Embedding service started (PID: $($proc.Id))" -ForegroundColor Green
    Write-Host "  Logs: $outLog" -ForegroundColor Gray
    
    # Wait for service to be ready
    Wait-ForService -Name "Embedding Service" -Url "http://localhost:$embeddingPort/healthz" | Out-Null
}
Write-Host ""

# ============================================
# 3. Start Tenant Pipeline Worker
# ============================================
Write-Host "[3/5] Starting Tenant Pipeline Worker..." -ForegroundColor Cyan

$outLog = Join-Path $tmpDir "tenant_pipeline_worker.out.log"
$errLog = Join-Path $tmpDir "tenant_pipeline_worker.err.log"

$proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm run worker:tenant-pipeline") -WorkingDirectory $repoRoot -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden

$script:servicePids['tenant-pipeline-worker'] = $proc.Id
Write-Host "✓ Tenant Pipeline Worker started (PID: $($proc.Id))" -ForegroundColor Green
Write-Host "  Logs: $outLog" -ForegroundColor Gray
Write-Host ""

# Give worker a moment to initialize
Start-Sleep -Seconds 2

# ============================================
# 4. Start Ingest Worker
# ============================================
Write-Host "[4/5] Starting Ingest Worker..." -ForegroundColor Cyan

$outLog = Join-Path $tmpDir "ingest_worker.out.log"
$errLog = Join-Path $tmpDir "ingest_worker.err.log"

$proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm run worker:ingest") -WorkingDirectory $repoRoot -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden

$script:servicePids['ingest-worker'] = $proc.Id
Write-Host "✓ Ingest Worker started (PID: $($proc.Id))" -ForegroundColor Green
Write-Host "  Logs: $outLog" -ForegroundColor Gray
Write-Host ""

# Give worker a moment to initialize
Start-Sleep -Seconds 2

# ============================================
# 5. Start Next.js Dev Server
# ============================================
Write-Host "[5/5] Starting Next.js Dev Server..." -ForegroundColor Cyan

$nextPort = 3000
if (Test-PortInUse -Port $nextPort) {
    Write-Host "✓ Next.js dev server already running on port $nextPort" -ForegroundColor Green
}
else {
    $outLog = Join-Path $tmpDir "next_dev.out.log"
    $errLog = Join-Path $tmpDir "next_dev.err.log"
    
    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm run dev") -WorkingDirectory $repoRoot -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden
    
    $script:servicePids['next-dev'] = $proc.Id
    Write-Host "✓ Next.js dev server started (PID: $($proc.Id))" -ForegroundColor Green
    Write-Host "  Logs: $outLog" -ForegroundColor Gray
    
    # Wait for Next.js to be ready
    Wait-ForService -Name "Next.js Dev Server" -Url "http://localhost:$nextPort" -MaxRetries 60 -DelaySeconds 2 | Out-Null
}
Write-Host ""

# ============================================
# Summary
# ============================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All Services Started Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service Status:" -ForegroundColor White
Write-Host "  • KeyDB (Redis):             localhost:6379" -ForegroundColor Gray
Write-Host "  • Embedding Service:         http://localhost:8000" -ForegroundColor Gray
Write-Host "  • Tenant Pipeline Worker:    Running (check logs)" -ForegroundColor Gray
Write-Host "  • Ingest Worker:             Running (check logs)" -ForegroundColor Gray
Write-Host "  • Next.js Dev Server:        http://localhost:3000" -ForegroundColor Gray
Write-Host ""
Write-Host "Started Process IDs:" -ForegroundColor White
foreach ($service in $script:servicePids.Keys) {
    Write-Host "  • $service : PID $($script:servicePids[$service])" -ForegroundColor Gray
}
Write-Host ""
Write-Host "Log Directory: $tmpDir" -ForegroundColor White
Write-Host ""
Write-Host "To stop all services, run:" -ForegroundColor Yellow
Write-Host "  .\scripts\stop-all-services.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ready to test onboarding flow at: http://localhost:3000" -ForegroundColor Green
Write-Host ""

# Save PIDs to file for cleanup script
$pidsFile = Join-Path $tmpDir "service-pids.json"
$script:servicePids | ConvertTo-Json | Set-Content $pidsFile
Write-Host "Service PIDs saved to: $pidsFile" -ForegroundColor Gray
