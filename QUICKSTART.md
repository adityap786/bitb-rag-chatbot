# Quick Start Guide - Phase 3/4 Features

This guide will help you get the new features up and running in **under 10 minutes**.

## ✅ Prerequisites Checklist

- [x] Supabase configured (already done)
- [x] Code deployed (all files created)
- [ ] Database migration applied
- [ ] Redis configured
- [ ] Features tested

---

## Step 1: Apply Database Migration (2 minutes)

### Option A: Supabase Dashboard (Recommended)

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `xabwdfohkeluojktnnic`
3. Go to **SQL Editor**
4. Open the migration file: `supabase/migrations/20251121000000_add_phase3_phase4_tables.sql`
5. Copy all content and paste into SQL Editor
6. Click **Run**

### Option B: Automated Script

```powershell
node scripts/apply-migration.mjs
```

### Verify Tables Created

Run this in Supabase SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'bookings', 
  'conversation_scores', 
  'analytics_metrics', 
  'orders', 
  'phi_detection_events', 
  'audit_logs'
);
```

You should see all 6 tables listed.

---


## Step 2: Configure Semantic Cache (LangCache SaaS)

The RAG pipeline now uses **LangCache SaaS** for fast, production-grade semantic caching. Redis is no longer required for semantic cache.

**Update .env.local:**
Add your LangCache API key (provided by your admin or LangCache dashboard):
```
LANGCACHE_API_KEY=your_langcache_api_key_here
```

**Note:** Redis is still used for rate limiting and queueing. If you are running locally, keep `REDIS_URL` for those features, but semantic cache is handled by LangCache SaaS.

---

## Step 3: Test Everything (3 minutes)

### Test 1: Redis Connection

```powershell
node scripts/test-redis.mjs
```

**Expected output:**
```
✅ Connected to Redis!
✅ All tests passed!
🎉 Redis is ready for rate limiting!
```

### Test 2: Authentication

```powershell
node scripts/test-auth.mjs
```

**Expected output:**
```
✅ User created: test-xxx@example.com
✅ Signed in successfully
✅ Token verified
✅ Authentication tests completed!
```

### Test 3: Start Development Server

```powershell
npm run dev
```

### Test 4: Test Protected Endpoint

**With curl:**
```powershell
# Test without auth (should fail with 401)
curl http://localhost:3000/api/booking `
  -X POST `
  -H "Content-Type: application/json" `
  -d '{\"date\":\"2025-11-25\",\"time\":\"10:00\"}'

# Test with auth token (get token from test-auth.mjs output)
curl http://localhost:3000/api/booking `
  -X POST `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_TOKEN_HERE" `
  -H "X-Tenant-ID: test-tenant" `
  -d '{\"date\":\"2025-11-25\",\"time\":\"10:00\"}'
```

**With Postman/Insomnia:**
1. Create POST request to `http://localhost:3000/api/booking`
2. Add header: `Authorization: Bearer YOUR_TOKEN`
3. Add header: `X-Tenant-ID: test-tenant`
4. Send request

---

## Step 4: Test Rate Limiting (2 minutes)

Create a test script to hit rate limits:

```javascript
// test-rate-limit.mjs
for (let i = 0; i < 150; i++) {
  const response = await fetch('http://localhost:3000/api/booking', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_TOKEN',
      'X-Tenant-ID': 'test-tenant'
    },
    body: JSON.stringify({ date: '2025-11-25', time: '10:00' })
  });
  
  console.log(`Request ${i + 1}: ${response.status}`);
  
  if (response.status === 429) {
    console.log('✅ Rate limit working! Got 429 after', i + 1, 'requests');
    break;
  }
}
```

Run: `node test-rate-limit.mjs`

**Expected:** After ~100 requests, you should see `429 Too Many Requests`

---

## What's New?

### 🗄️ Database Tables

| Table | Purpose |
|-------|---------|
| `bookings` | Appointment scheduling |
| `conversation_scores` | AI quality metrics |
| `analytics_metrics` | Performance tracking (partitioned) |
| `orders` | E-commerce orders |
| `phi_detection_events` | HIPAA compliance |
| `audit_logs` | Security audit trail |

### 🔐 Authentication

All API endpoints now require:
- **Bearer token** in `Authorization` header
- **Tenant ID** in `X-Tenant-ID` header or request body

### 🚦 Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/api/booking` | 100 requests/minute |
| `/api/analytics/scoring` | 1,000 requests/hour |
| `/api/analytics/metrics` | 10,000 requests/hour |
| `/api/ecommerce/checkout` | 10 requests/hour |

---

## Troubleshooting

### ❌ "Cannot find module '@supabase/supabase-js'"
```powershell
npm install
```

### ❌ "Redis connection refused"
Make sure Redis is running:
```powershell
# WSL
sudo service redis-server start

# Or use Upstash instead
```

### ❌ "Missing environment variables"
Check `.env.local` has:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL` or `UPSTASH_REDIS_URL`

### ❌ "Table does not exist"
Apply the database migration (Step 1)

---

## Next Steps

1. **Create tenant records** in Supabase dashboard
2. **Add users to tenants** via `tenant_users` table
3. **Test with real data** using your frontend
4. **Deploy to production** (see `PRODUCTION_SETUP_GUIDE.md`)

---

## Files Reference

- **Migration:** `supabase/migrations/20251121000000_add_phase3_phase4_tables.sql`
- **Auth Middleware:** `src/middleware/auth.ts`
- **Rate Limiting:** `src/middleware/rate-limit.ts`
- **Updated APIs:** `src/app/api/booking/`, `analytics/`, `ecommerce/`
- **Full Guide:** `PRODUCTION_SETUP_GUIDE.md`

---

**Need help?** Check `PRODUCTION_SETUP_GUIDE.md` for detailed troubleshooting and production deployment steps.
