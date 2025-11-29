param(
  [string]$cdnUrl,
  [string]$apiToken
)

if (-not $cdnUrl) {
  Write-Error 'CDN URL required.'
  exit 1
}
if (-not $apiToken) {
  Write-Error 'API token required.'
  exit 1
}

# Example for Cloudflare API
$headers = @{ 'Authorization' = "Bearer $apiToken"; 'Content-Type' = 'application/json' }
$body = @{ "files" = @($cdnUrl) } | ConvertTo-Json

$resp = Invoke-RestMethod -Uri 'https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache' -Method POST -Headers $headers -Body $body

if ($resp.success) {
  Write-Host "CDN cache purged for $cdnUrl"
} else {
  Write-Error "Failed to purge CDN cache: $($resp.errors)"
}
