# Fix WSL Display Scale Issues

## Immediate Fixes

### Fix 1: Adjust Windows Display Settings
1. Right-click Desktop → **Display settings**
2. Under **Scale and layout**, adjust to your preferred scale (100%, 125%, 150%)
3. Click **Apply**

### Fix 2: Disable WSL GUI (WSLg)
WSLg can interfere with display scaling. Disable it:

```powershell
# Create or edit .wslconfig
$wslConfig = @"
[wsl2]
guiApplications=false
"@

$wslConfig | Set-Content "$env:USERPROFILE\.wslconfig"

# Restart WSL
wsl --shutdown
```

Run this script to apply the fix:
```powershell
.\scripts\fix-wsl-display.ps1
```

### Fix 3: Revert Display Settings via PowerShell
```powershell
# Reset to 100% scaling
Set-DisplayResolution -Width 1920 -Height 1080
# Adjust resolution to your monitor's native resolution
```

---

## Option: Uninstall WSL (If Issues Persist)

If WSL continues causing problems, you can uninstall it:

```powershell
# Uninstall WSL (Run as Administrator)
wsl --unregister Ubuntu
wsl --uninstall

# Disable WSL feature
Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux
Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform

# Restart computer
Restart-Computer
```

After uninstall, use the simpler Redis option below.

---

## **Recommended: Use Redis for Windows (No WSL Required)** ✅

This is simpler and avoids all WSL issues!

### Download Options:

**Option A: Memurai (Recommended - Easiest)**
- Download: https://www.memurai.com/
- Click "Download Memurai Developer"
- Install with defaults
- Runs automatically on port 6379
- ✅ No display issues
- ✅ Works immediately

**Option B: Redis for Windows (Microsoft Archive)**
- Download: https://github.com/microsoftarchive/redis/releases/download/win-3.0.504/Redis-x64-3.0.504.msi
- Install MSI
- Runs as Windows service
- ✅ Simple installation

### After Installing Redis for Windows:

Your existing scripts already support it!

```powershell
# Just run your services
.\scripts\start-all-services.ps1
```

The script will detect Redis on port 6379 automatically.

---

## Comparison

| Feature | WSL + Redis | Memurai | Redis Windows MSI |
|---------|-------------|---------|-------------------|
| **Display Issues** | ❌ Can occur | ✅ None | ✅ None |
| **Installation** | Complex | 1-click | 1-click |
| **Performance** | Best | Good | Moderate |
| **Maintenance** | Manual | Auto-update | None (old) |
| **Best For** | Power users | **Development** ⭐ | Simple setups |

---

## My Recommendation

**For your use case**: Use **Memurai** (Option A)
- Avoids WSL display issues completely
- Easy installation (2 minutes)
- Good performance for development
- Your scripts already support it
- No configuration needed

**Steps:**
1. Uninstall WSL (if you want, optional)
2. Download Memurai
3. Install
4. Run `.\scripts\start-all-services.ps1`
5. Done!

---

## Need Help?

Let me know if you'd like me to:
1. Fix the display scaling issue
2. Create an automated Memurai installation script
3. Uninstall WSL for you
