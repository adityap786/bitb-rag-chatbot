# Stop All Services
# This script stops all services started by start-all-services.ps1

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Stopping All Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$tmpDir = Join-Path $repoRoot ".tmp"
$pidsFile = Join-Path $tmpDir "service-pids.json"

# Try to load PIDs from file
$savedPids = @{}
if (Test-Path $pidsFile) {
    try {
        $savedPids = Get-Content $pidsFile | ConvertFrom-Json -AsHashtable
        Write-Host "Loaded service PIDs from: $pidsFile" -ForegroundColor Gray
    }
    catch {
        Write-Host "Could not load PIDs file, will search for processes..." -ForegroundColor Yellow
    }
}

# Function to kill process safely
function Stop-ServiceProcess {
    param(
        [string]$Name,
        [int]$ProcessId
    )
    
    try {
        $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $ProcessId -Force -ErrorAction Stop
            Write-Host "✓ Stopped $Name (PID: $ProcessId)" -ForegroundColor Green
            return $true
        }
        else {
            Write-Host "○ $Name (PID: $ProcessId) - already stopped" -ForegroundColor Gray
            return $false
        }
    }
    catch {
        Write-Host "✗ Failed to stop $Name (PID: $ProcessId): $_" -ForegroundColor Red
        return $false
    }
}

# Stop services from saved PIDs
if ($savedPids.Count -gt 0) {
    Write-Host "Stopping services from saved PIDs..." -ForegroundColor Cyan
    foreach ($service in $savedPids.Keys) {
        Stop-ServiceProcess -Name $service -ProcessId $savedPids[$service]
    }
    Write-Host ""
}

# Additional cleanup: Find and stop processes by port or command line
Write-Host "Searching for remaining service processes..." -ForegroundColor Cyan

# Stop Next.js dev server (port 3000)
$nextProcs = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | 
Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $nextProcs) {
    Stop-ServiceProcess -Name "Next.js Dev (port 3000)" -ProcessId $processId
}

# Stop Embedding service (port 8000)
$embeddingProcs = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | 
Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $embeddingProcs) {
    Stop-ServiceProcess -Name "Embedding Service (port 8000)" -ProcessId $processId
}

# Stop workers (search by command line containing "worker:")
$allProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like "*worker:tenant-pipeline*" -or 
    $_.CommandLine -like "*worker:ingest*" -or
    $_.CommandLine -like "*tenantPipelineWorker*" -or
    $_.CommandLine -like "*ingestWorker*"
}

foreach ($proc in $allProcesses) {
    Stop-ServiceProcess -Name "Worker ($($proc.Name))" -ProcessId $proc.ProcessId
}

Write-Host ""

# Clean up PIDs file
if (Test-Path $pidsFile) {
    Remove-Item $pidsFile -Force
    Write-Host "Cleaned up PIDs file" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Services Stopped" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: Redis/Memurai was not stopped (it may be used by other apps)" -ForegroundColor Yellow
Write-Host "If you want to stop Redis/Memurai, run:" -ForegroundColor Gray
Write-Host "  Stop-Process -Name memurai -Force" -ForegroundColor Cyan
Write-Host ""
