# Apply Ingestion Jobs Migration to Supabase
# This script applies the ingestion_jobs table migration

param(
    [switch]$DryRun = $false
)

Write-Host "=== Supabase Migration: ingestion_jobs table ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "ERROR: .env.local file not found!" -ForegroundColor Red
    Write-Host "Please create .env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Yellow
    exit 1
}

# Load environment variables
Get-Content ".env.local" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$SUPABASE_URL = $env:SUPABASE_URL
$SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_URL -or -not $SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "ERROR: Missing required environment variables!" -ForegroundColor Red
    Write-Host "Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Yellow
    exit 1
}

Write-Host "Supabase URL: $SUPABASE_URL" -ForegroundColor Green

# Read migration file
$migrationFile = "supabase\migrations\20251121000001_create_ingestion_jobs.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "ERROR: Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

$migrationSQL = Get-Content $migrationFile -Raw
Write-Host "Migration file loaded: $migrationFile" -ForegroundColor Green
Write-Host ""

if ($DryRun) {
    Write-Host "=== DRY RUN MODE - SQL Preview ===" -ForegroundColor Yellow
    Write-Host $migrationSQL
    Write-Host ""
    Write-Host "=== END DRY RUN ===" -ForegroundColor Yellow
    exit 0
}

# Execute migration via Supabase REST API
Write-Host "Applying migration..." -ForegroundColor Cyan


# Note: Supabase REST API doesn't support direct SQL execution for migrations
# We'll use the rpc endpoint or recommend using Supabase CLI
Write-Host ""
Write-Host "⚠️  IMPORTANT: Direct SQL execution requires Supabase CLI or Database UI" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Using Supabase CLI (Recommended)" -ForegroundColor Cyan
Write-Host "  1. Install: npm install -g supabase" -ForegroundColor Gray
Write-Host "  2. Login: supabase login" -ForegroundColor Gray
Write-Host "  3. Link project: supabase link --project-ref YOUR_PROJECT_REF" -ForegroundColor Gray
Write-Host "  4. Run migrations: supabase db push" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 2: Using Supabase Dashboard" -ForegroundColor Cyan
Write-Host "  1. Go to: $SUPABASE_URL/project/default/sql" -ForegroundColor Gray
Write-Host "  2. Copy SQL from: $migrationFile" -ForegroundColor Gray
Write-Host "  3. Paste and execute in SQL Editor" -ForegroundColor Gray
Write-Host ""
Write-Host "Option 3: Using psql (Direct Database Connection)" -ForegroundColor Cyan
Write-Host "  Get connection string from Supabase Dashboard → Database → Connection string" -ForegroundColor Gray
Write-Host "  Then run: psql 'YOUR_CONNECTION_STRING' -f $migrationFile" -ForegroundColor Gray
Write-Host ""


Write-Host ""
Write-Host "=== Migration script complete ===" -ForegroundColor Cyan
