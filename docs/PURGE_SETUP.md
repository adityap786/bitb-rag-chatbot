# Trial Data Purge - Setup Guide

This guide explains how to set up automatic purging of expired trial data.

## Overview

The purge system automatically cleans up expired trial data including:
- FAISS vector indices
- Knowledge base entries
- Embeddings
- Chat sessions
- Trial tenant records (status updated to 'expired')

## API Endpoint

```
POST /api/admin/purge-expired
```

### Query Parameters

- `dry_run` (boolean, default: false) - Preview what would be deleted without actually deleting
- `grace_period_hours` (number, default: 0) - Additional hours past expiry before deletion

### Authentication

Requires admin JWT token with admin role.

## Setup Options

### Option 1: Vercel Cron Jobs (Recommended for Vercel deployments)

1. Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/admin/purge-expired",
      "schedule": "0 2 * * *"
    }
  ]
}
```

2. Set environment variable in Vercel dashboard:
```
CRON_SECRET=your-secure-random-string
```

3. Update the API route to verify cron secret:

```typescript
// In src/app/api/admin/purge-expired/route.ts
const cronSecret = req.headers.get('authorization');
if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Option 2: GitHub Actions (Platform-agnostic)

Create `.github/workflows/purge-trials.yml`:

```yaml
name: Purge Expired Trials

on:
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Purge API
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.ADMIN_JWT_TOKEN }}" \
            "${{ secrets.APP_URL }}/api/admin/purge-expired"
```

**Required Secrets:**
- `ADMIN_JWT_TOKEN` - JWT token with admin role
- `APP_URL` - Your application URL (e.g., https://your-app.vercel.app)

### Option 3: Render Cron Jobs (For Render deployments)

1. Create a new Cron Job in Render dashboard
2. Command: 
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_JWT_TOKEN" https://your-app.render.com/api/admin/purge-expired
```
3. Schedule: `0 2 * * *` (daily at 2 AM)

### Option 4: Host-level Cron (Traditional Linux/Mac servers)

1. Generate an admin JWT token:
```bash
node scripts/generate-admin-token.mjs
```

2. Create cron script `/usr/local/bin/purge-expired-trials.sh`:

```bash
#!/bin/bash
ADMIN_TOKEN="your-admin-jwt-token"
API_URL="https://your-app.com/api/admin/purge-expired"

curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL"
```

3. Make executable:
```bash
chmod +x /usr/local/bin/purge-expired-trials.sh
```

4. Add to crontab (`crontab -e`):
```
# Purge expired trials daily at 2 AM
0 2 * * * /usr/local/bin/purge-expired-trials.sh >> /var/log/trial-purge.log 2>&1
```

### Option 5: Windows Task Scheduler

1. Create PowerShell script `purge-expired-trials.ps1`:

```powershell
$adminToken = "your-admin-jwt-token"
$apiUrl = "https://your-app.com/api/admin/purge-expired"

$headers = @{
    "Authorization" = "Bearer $adminToken"
}

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers
    Write-Host "Purge completed: $($response | ConvertTo-Json)"
} catch {
    Write-Error "Purge failed: $_"
}
```

2. Create Scheduled Task:
   - Open Task Scheduler
   - Create Basic Task
   - Trigger: Daily at 2:00 AM
   - Action: Start a program
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "C:\path\to\purge-expired-trials.ps1"`

## Testing

### Preview (Dry Run)

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://your-app.com/api/admin/purge-expired?dry_run=true"
```

### Manual Trigger

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://your-app.com/api/admin/purge-expired"
```

### Preview Expired Trials

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://your-app.com/api/admin/purge-expired"
```

## Grace Period

Add a grace period to give expired trials extra time before deletion:

```bash
# Delete only trials expired more than 24 hours ago
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "https://your-app.com/api/admin/purge-expired?grace_period_hours=24"
```

## Monitoring

### Log Output

The purge endpoint returns:
```json
{
  "success": true,
  "message": "Purge completed",
  "total": 5,
  "purged": [...],
  "failed": [...],
  "dry_run": false
}
```

### Recommended Alerts

Set up alerts for:
1. Purge failures (`failed.length > 0`)
2. Large purge batches (unusual activity)
3. Purge job not running (missed cron)

### Integration with Monitoring

Add to your monitoring service (Sentry, DataDog, etc.):

```typescript
// In route.ts
import * as Sentry from '@sentry/nextjs';

if (results.failed.length > 0) {
  Sentry.captureMessage('Trial purge had failures', {
    level: 'warning',
    extra: { failed: results.failed }
  });
}
```

## Best Practices

1. **Always test with dry_run first** in production
2. **Set up monitoring** to catch purge failures
3. **Use grace period** (24h recommended) to avoid accidental early deletion
4. **Back up data** before first production purge
5. **Schedule during low-traffic hours** (e.g., 2-4 AM)
6. **Rotate admin tokens** periodically for cron jobs
7. **Log purge operations** for audit trail

## Troubleshooting

### Purge fails silently

Check Python worker logs and ensure `--purge-trial` flag is supported.

### Permission denied

Verify admin JWT token is valid and has admin role.

### Timeout errors

Increase timeout in route handler if purging many trials.

### FAISS files not deleted

Check file system permissions and paths in Python worker.

## Security Notes

- Admin tokens for cron should be separate from user-facing tokens
- Use environment variables or secrets management (never hardcode)
- Implement rate limiting on the purge endpoint
- Log all purge operations with timestamps and admin identity
- Consider implementing approval workflow for large purges

## Production Checklist

- [ ] Migration applied (ingestion_jobs table exists)
- [ ] Admin authentication working
- [ ] Python worker supports --purge-trial flag
- [ ] Cron job configured and tested (dry run)
- [ ] Monitoring and alerting set up
- [ ] Logs being captured
- [ ] Grace period configured
- [ ] Backup strategy in place
- [ ] First production purge tested in low-stakes environment
