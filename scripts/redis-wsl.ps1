# WSL Redis Management Helper
# Quick commands to manage Redis in WSL

param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'cli', 'logs')]
    [string]$Command = 'status'
)

switch ($Command) {
    'start' {
        Write-Host "Starting Redis in WSL..." -ForegroundColor Yellow
        wsl sudo service redis-server start
        Start-Sleep -Seconds 1
        wsl sudo service redis-server status
    }
    
    'stop' {
        Write-Host "Stopping Redis in WSL..." -ForegroundColor Yellow
        wsl sudo service redis-server stop
    }
    
    'restart' {
        Write-Host "Restarting Redis in WSL..." -ForegroundColor Yellow
        wsl sudo service redis-server restart
        Start-Sleep -Seconds 1
        wsl sudo service redis-server status
    }
    
    'status' {
        wsl sudo service redis-server status
        Write-Host ""
        $testConn = Test-NetConnection -ComputerName localhost -Port 6379 -WarningAction SilentlyContinue
        if ($testConn.TcpTestSucceeded) {
            Write-Host "✓ Redis is accessible from Windows (localhost:6379)" -ForegroundColor Green
        }
        else {
            Write-Host "✗ Redis port not accessible from Windows" -ForegroundColor Red
        }
    }
    
    'cli' {
        Write-Host "Opening Redis CLI (type 'exit' to quit)..." -ForegroundColor Gray
        wsl redis-cli
    }
    
    'logs' {
        Write-Host "Redis logs (last 50 lines):" -ForegroundColor Gray
        wsl sudo tail -n 50 /var/log/redis/redis-server.log
    }
}
