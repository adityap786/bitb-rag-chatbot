
<#
Writes environment variables to `.env.local` via secure prompts.

Usage:
  # Run normally (script will prompt for keys and write .env.local)
  .\scripts\write-env.ps1

  # To force overwrite without confirmation
  .\scripts\write-env.ps1 -Force

Security:
  - This writes keys to a local file that should be in .gitignore. The script will warn if .env.local is listed in .gitignore.
  - For safety, the script prompts for the service role and OpenAI keys using secure input.
#>

param(
  [switch]$Force
)

function Read-Secure { param($prompt) $s = Read-Host -Prompt $prompt -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }

$path = Join-Path (Get-Location) '.env.local'
if ((-not $Force) -and (Test-Path $path)) {
  $yn = Read-Host -Prompt ".env.local already exists. Overwrite? (y/N)"
  if ($yn.ToLower() -ne 'y') { Write-Host 'Canceled.'; exit 0 }
}

$supabaseUrl = Read-Host -Prompt 'SUPABASE_URL (example: https://xabwdfohkeluojktnnic.supabase.co)'
$svcKey = Read-Secure 'SUPABASE_SERVICE_ROLE_KEY (secret - will be hidden while typing)'
$openAi = Read-Secure 'OPENAI_API_KEY (secret - will be hidden while typing)'
$provider = Read-Host -Prompt 'BITB_LLM_PROVIDER (optional - default: groq)'
$model = Read-Host -Prompt 'BITB_LLM_MODEL (optional - default: llama-3.1-70b-instruct)'
$groq = Read-Secure 'GROQ_API_KEY (optional - for GROQ provider - secret)'
$groqBase = Read-Host -Prompt 'GROQ_BASE_URL (optional - default: https://api.groq.com/openai/v1)'
$anon = Read-Host -Prompt 'NEXT_PUBLIC_SUPABASE_ANON_KEY (optional - press Enter to skip)'
$widget = Read-Host -Prompt 'NEXT_PUBLIC_WIDGET_URL (default: http://localhost:3000)'
if (-not $widget) { $widget = 'http://localhost:3000' }

if ([string]::IsNullOrWhiteSpace($supabaseUrl) -or [string]::IsNullOrWhiteSpace($svcKey) -or [string]::IsNullOrWhiteSpace($openAi)) {
  Write-Host 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY are required.' -ForegroundColor Red
  exit 1
}

$content = @"

$BITB_LLM_PROVIDER = if ([string]::IsNullOrWhiteSpace($provider)) { 'groq' } else { $provider }
$BITB_LLM_MODEL = if ([string]::IsNullOrWhiteSpace($model)) { 'llama-3.1-70b-instruct' } else { $model }
$GROQ_BASE_URL = if ([string]::IsNullOrWhiteSpace($groqBase)) { 'https://api.groq.com/openai/v1' } else { $groqBase }

$content = @"
SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_ROLE_KEY=$svcKey
OPENAI_API_KEY=$openAi
BITB_LLM_PROVIDER=$BITB_LLM_PROVIDER
BITB_LLM_MODEL=$BITB_LLM_MODEL
GROQ_API_KEY=$groq
GROQ_BASE_URL=$GROQ_BASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
NEXT_PUBLIC_WIDGET_URL=$widget
"@

Set-Content -Path $path -Value $content -Encoding UTF8
Write-Host "Wrote .env.local to $path" -ForegroundColor Green
if (Test-Path .gitignore) {
  $gitignore = Get-Content .gitignore
  if ($gitignore -notcontains '.env.local') { Write-Host "Warning: .env.local not present in .gitignore. Add to .gitignore to avoid committing secrets." -ForegroundColor Yellow }
}