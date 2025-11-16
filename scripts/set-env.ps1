<#
Set environment variables from `.env.local` into the current PowerShell session.

Usage:
  # 1) Dot-source to set the variables in the current shell
  . .\scripts\set-env.ps1

  # 2) Or run to interactively type keys (they will not persist after shell closes)
  . .\scripts\set-env.ps1 -Interactive

Notes:
  - This script does NOT write keys to disk.
  - If `.env.local` exists it will be parsed. If keys are missing or truncated ("..."), you will be prompted.
  - Dot-sourcing is required so the script can set $env: variables on your current shell.
#>

param(
  [switch]$Interactive
)

function Get-EnvFileMap {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path $Path)) { return $map }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $kv = $line -split('=', 2)
    if ($kv.Count -eq 2) {
      $key = $kv[0].Trim()
      $value = $kv[1].Trim().Trim('"')
      $map[$key] = $value
    }
  }
  return $map
}

function Set-EnvFromMap {
  param([hashtable]$Map)

  $keys = @('SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_WIDGET_URL')
  # LLM provider keys
  $keys += @('BITB_LLM_PROVIDER','BITB_LLM_MODEL','GROQ_API_KEY','GROQ_BASE_URL')
  foreach ($k in $keys) {
    if ($Map.ContainsKey($k) -and $Map[$k]) {
      $value = $Map[$k]
      if ($value -like '*...*') {
        Write-Host "WARN: "$k" looks truncated (contains '...'). Please open .env.local and paste the full key."
      }
      # Set in environment for the current session
      Set-Item -Path env:$k -Value $value
      Write-Host "Set: $k"
    }
  }
}

function PromptAndSet {
  # Ask for the required keys and set them in env
  $required = @('SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY')
  $required += @('BITB_LLM_PROVIDER')
  foreach ($k in $required) {
    $val = Read-Host -Prompt "Enter value for $k" -AsSecureString
    if ($null -eq $val) { continue }
    $unsecure = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($val))
    Set-Item -Path env:$k -Value $unsecure
    Write-Host "Set: $k"
  }
  # Optional keys
  $anon = Read-Host -Prompt "Enter optional NEXT_PUBLIC_SUPABASE_ANON_KEY (leave empty to skip)"
  if ($anon) { Set-Item -Path env:NEXT_PUBLIC_SUPABASE_ANON_KEY -Value $anon; Write-Host "Set NEXT_PUBLIC_SUPABASE_ANON_KEY" }
  $widget = Read-Host -Prompt "Enter optional NEXT_PUBLIC_WIDGET_URL (default http://localhost:3000)"
  if ($widget) { Set-Item -Path env:NEXT_PUBLIC_WIDGET_URL -Value $widget; Write-Host "Set NEXT_PUBLIC_WIDGET_URL" }
}

function Show-EnvSummary {
  $envkeys = @('SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_WIDGET_URL')
  $envkeys += @('BITB_LLM_PROVIDER','BITB_LLM_MODEL','GROQ_API_KEY','GROQ_BASE_URL')
  Write-Host "\nEnvironment variables now set in current shell (note: these are not saved to disk):"
  foreach ($k in $envkeys) {
    if (Get-ChildItem env:$k -ErrorAction SilentlyContinue) {
      $v = (Get-ChildItem env:$k).Value
      if ($k -eq 'SUPABASE_SERVICE_ROLE_KEY' -or $k -eq 'OPENAI_API_KEY') {
        Write-Host "$k = $($v.Substring(0,8))..." -ForegroundColor Yellow
      } else {
        Write-Host "$k = $v"
      }
    }
  }
}

$envPath = Join-Path (Get-Location) '.env.local'
if ( -not $Interactive -and (Test-Path $envPath) ) {
  $map = Get-EnvFileMap -Path $envPath
  if ($map.Count -eq 0) {
    Write-Host "Found .env.local but no keys were parsed. Run script with -Interactive to type keys." -ForegroundColor Red
  } else {
    Set-EnvFromMap -Map $map
  }
} else {
  Write-Host "Interactive mode: type the env values when prompted" -ForegroundColor Cyan
  PromptAndSet
}

Show-EnvSummary

Write-Host "\nRun 'npm run test:supabase' or 'npm run dev' in this shell to verify." -ForegroundColor Green