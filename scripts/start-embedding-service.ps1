param(
  [int]$Port = 8000,
  [string]$Model = "sentence-transformers/all-mpnet-base-v2"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$serviceDir = Join-Path $repoRoot "services\bge_embedding_service"
$pythonExe = Join-Path $repoRoot "langcache.venv\Scripts\python.exe"

if (!(Test-Path $pythonExe)) {
  throw "Python venv not found at: $pythonExe"
}

if (!(Test-Path $serviceDir)) {
  throw "Embedding service directory not found at: $serviceDir"
}

$existingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingListener) {
  Write-Host "Port $Port is already in use (PID $($existingListener.OwningProcess))."
  Write-Host "If this is the embedding service already running, you can proceed."
  exit 0
}

$env:BGE_MODEL = $Model

$tmpDir = Join-Path $repoRoot ".tmp"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$outLog = Join-Path $tmpDir "bge_embedding_service.out.log"
$errLog = Join-Path $tmpDir "bge_embedding_service.err.log"

$proc = Start-Process -FilePath $pythonExe -ArgumentList @("-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "$Port") -WorkingDirectory $serviceDir -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

Write-Host "Started embedding service (PID $($proc.Id)) on port $Port."
Write-Host "Logs:"
Write-Host "  $outLog"
Write-Host "  $errLog"
