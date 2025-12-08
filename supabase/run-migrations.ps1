# Run Supabase SQL migration locally using psql
# Usage: set $env:SUPABASE_DB_URL to your Supabase DB connection string
# Example:
# $env:SUPABASE_DB_URL = 'postgres://postgres:password@db.host:5432/postgres'
# .\supabase\run-migrations.ps1

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Error "psql not found. Install PostgreSQL client or use the Supabase SQL Editor instead."
  exit 1
}

if (-not $env:SUPABASE_DB_URL) {
  Write-Host "Environment variable SUPABASE_DB_URL is not set. Please set it to your DB connection string and retry."
  exit 1
}

$migrationPath = Join-Path -Path (Get-Location) -ChildPath "supabase/migrations/2025-11-22_create_vector_documents_and_rpc.sql"
if (-not (Test-Path $migrationPath)) {
  Write-Error "Migration file not found at $migrationPath"
  exit 1
}

Write-Host "Running migration: $migrationPath"
$exit = & psql $env:SUPABASE_DB_URL -f $migrationPath
if ($LASTEXITCODE -ne 0) {
  Write-Error "psql exit code: $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Host "Migration completed."