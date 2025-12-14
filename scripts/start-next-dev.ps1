param(
  [int]$Port = 3000
)

$repoRoot = Split-Path -Parent $PSScriptRoot

$existingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  Write-Host "Port $Port is already in use (PID $($existingListener.OwningProcess))."
  Write-Host "If this is the Next.js dev server already running, you can proceed."
  exit 0
}

$tmpDir = Join-Path $repoRoot ".tmp"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$outLog = Join-Path $tmpDir "next_dev.out.log"
$errLog = Join-Path $tmpDir "next_dev.err.log"

$proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm run dev") -WorkingDirectory $repoRoot -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

Write-Host "Started Next.js dev server (PID $($proc.Id))."
Write-Host "Logs:"
Write-Host "  $outLog"
Write-Host "  $errLog"
