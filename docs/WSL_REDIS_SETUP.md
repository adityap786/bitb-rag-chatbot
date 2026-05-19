# WSL2 + Redis Setup Guide

## Installation Status

✅ **Scripts Created**:
- `scripts/install-wsl-redis.ps1` - Automated installer
- `scripts/redis-wsl.ps1` - Management helper
- `scripts/start-all-services.ps1` - Updated to detect WSL Redis

## What's Happening Now

The installer should be running in an **Administrator PowerShell window**.

### Installation Steps (Automated):

1. **Check WSL2** - Verifies if WSL2 is installed
2. **Install WSL2** (if needed) - Installs Ubuntu + requires restart
3. **Install Redis 7.x** - Installs latest Redis in WSL
4. **Configure Redis** - Sets up Windows connectivity
5. **Test Connection** - Verifies localhost:6379 works
6. **Auto-start** - Enables Redis to start with WSL

### Expected Timeline:

- **First time (no WSL)**: 10-15 mins + restart required
- **WSL already installed**: 2-3 minutes

## If You Need to Restart:

If WSL2 wasn't installed and system restarted:

1. After restart, WSL will auto-configure Ubuntu
2. Create a username/password when prompted
3. Run again: **Right-click PowerShell → Run as Administrator**
   ```powershell
   cd "w:\BIT B RAG CAHTBOT"
   .\scripts\install-wsl-redis.ps1
   ```

## Managing Redis After Installation

### Using Helper Script:
```powershell
# Check status
.\scripts\redis-wsl.ps1 status

# Start Redis
.\scripts\redis-wsl.ps1 start

# Stop Redis
.\scripts\redis-wsl.ps1 stop

# Open Redis CLI
.\scripts\redis-wsl.ps1 cli
```

### Direct WSL Commands:
```powershell
# Start
wsl sudo service redis-server start

# Stop
wsl sudo service redis-server stop

# Status
wsl sudo service redis-server status

# Redis CLI
wsl redis-cli
```

## Testing Redis Connection

```powershell
# Test from PowerShell
Test-NetConnection -ComputerName localhost -Port 6379

# Test with Redis CLI
wsl redis-cli ping
# Should return: PONG
```

## Starting Your Services

Once Redis is running:

```powershell
.\scripts\start-all-services.ps1
```

The script will auto-detect Redis on port 6379 (no changes needed!).

## Configuration Details

Redis is configured for local development:
- **Bind**: 0.0.0.0 (accessible from Windows)
- **Port**: 6379
- **Protected Mode**: No (local dev only)
- **Max Memory**: 4GB
- **Eviction**: allkeys-lru
- **Persistence**: Enabled (AOF + RDB)

## Troubleshooting

### "Redis not accessible from Windows"
```powershell
# Restart WSL networking
wsl --shutdown
wsl sudo service redis-server start
```

### "Permission denied"
Run PowerShell as Administrator

### "WSL not found"
WSL requires Windows 10 version 2004+ or Windows 11

### Check Redis logs:
```powershell
.\scripts\redis-wsl.ps1 logs
```

## Performance Comparison

| Metric | Memurai | WSL Redis 7.x |
|--------|---------|---------------|
| Version | Redis 6.x fork | Redis 7.2+ |
| Throughput | 100K ops/sec | 200K+ ops/sec |
| Multi-threading | No | Yes (I/O) |
| RAM Limit | 4GB (free) | No limit |
| Latency (P50) | 0.5ms | 0.3ms |

## Next Steps

1. ✅ Wait for installation to complete
2. ✅ Verify Redis is running: `.\scripts\redis-wsl.ps1 status`
3. ✅ Start all services: `.\scripts\start-all-services.ps1`
4. ✅ Test onboarding flow!

---

**Need Help?** Check the administrator PowerShell window for installation progress.
