param(
  [string]$filePath
)

if (-not $filePath) {
  Write-Error 'File path required.'
  exit 1
}

if (-not (Test-Path $filePath)) {
  Write-Error "File not found: $filePath"
  exit 1
}

# Compute SRI hash (SHA384)
$sri = [Convert]::ToBase64String((Get-FileHash -Path $filePath -Algorithm SHA384).Hash)
Write-Host "SRI hash (sha384): sha384-$sri"
