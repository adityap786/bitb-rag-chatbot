param(
    [string]$BaseUrl = $env:NEXT_PUBLIC_APP_URL,
    [string]$CronSecret = $env:CRON_SECRET
)

if (-not $BaseUrl -or [string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = "http://localhost:3000"
}

if (-not $CronSecret -or [string]::IsNullOrWhiteSpace($CronSecret)) {
    Write-Error "CRON_SECRET is not set. Export it before running this script."
    exit 1
}

$endpoint = "$BaseUrl/api/admin/metrics/aggregate"

Write-Host "[aggregate-metrics] Target: $endpoint" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Headers @{ "x-cron-secret" = $CronSecret } -TimeoutSec 120
    Write-Host "[aggregate-metrics] Success at $(Get-Date -Format o)" -ForegroundColor Green
    if ($response) {
        Write-Host ($response | ConvertTo-Json -Depth 5)
    }
    exit 0
} catch {
    Write-Error "[aggregate-metrics] Failed: $($_.Exception.Message)"
    if ($_.ErrorDetails) { Write-Error $_.ErrorDetails }
    exit 1
}
