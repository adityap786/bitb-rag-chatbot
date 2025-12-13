# Production Setup Guide

This guide walks you through setting up the database migration, authentication, and rate limiting for production deployment.

## Prerequisites

- Node.js 18+ and npm installed
- Supabase project created
- Redis instance (local or Upstash)
- Access to project repository

---

## Step 1: Database Migration

### 1.1 Apply Migration to Supabase

**Option A: Using Supabase CLI** (Recommended)

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Apply migration
supabase db push
```

**Option B: Using Supabase Dashboard**

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor**
4. Copy content from `supabase/migrations/20251121000000_add_phase3_phase4_tables.sql`
5. Paste and click **Run**

### 1.2 Verify Migration

Run this query in SQL Editor to verify tables were created:

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

### 1.3 Check Row Level Security

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'bookings',
  'conversation_scores',
  'analytics_metrics',
  'orders',
  'phi_detection_events',
  'audit_logs'
);
```

All tables should have `rowsecurity = true`.

---

## Step 2: Redis Setup

### Option A: Local Redis (Development)

**Install Redis:**

```bash
# Windows (using Chocolatey)
choco install redis-64

# Or download from: https://redis.io/download

# Start Redis
redis-server
```

**Configure Environment:**

```bash
# Add to .env.local
BULLMQ_REDIS_URL=redis://localhost:6379
```

### Option B: Upstash Redis (Production - Recommended)

**Create Upstash Redis:**

1. Go to https://console.upstash.com
2. Click **Create Database**
3. Choose region closest to your Vercel deployment
4. Select **Regional** (cheaper) or **Global** (faster)
5. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**

**Configure Environment:**

```bash
# Add to .env.local
UPSTASH_REDIS_REST_URL=https://your-region.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# BullMQ requires a Redis *protocol* URL (redis:// or rediss://), not the REST URL.
# Upstash provides this in the console as the "Redis URL" / "TLS URL".
BULLMQ_REDIS_URL=rediss://default:password@your-region.upstash.io:6379
```

### Test Redis Connection

Create `scripts/test-redis.mjs`:

```javascript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

try {
  await redis.set('test', 'hello');
  const value = await redis.get('test');
  console.log('✅ Redis connected:', value);
  await redis.del('test');
  process.exit(0);
} catch (error) {
  console.error('❌ Redis connection failed:', error);
  process.exit(1);
} finally {
  await redis.quit();
}
```

Run test:

```bash
node scripts/test-redis.mjs
```

### Test BullMQ Redis (Queue Worker)

BullMQ requires a Redis protocol URL. Verify `BULLMQ_REDIS_URL` works:

```bash
redis-cli -u "$BULLMQ_REDIS_URL" PING
```

### Start the Tenant Pipeline Worker

The RAG ingestion pipeline runs in a dedicated BullMQ worker process (not inside Next.js requests).

```bash
npm run worker:tenant-pipeline
```

---

## Step 3: Environment Configuration

### 3.1 Copy Environment Template

```bash
cp .env.template .env.local
```

### 3.2 Configure Supabase

Get values from https://app.supabase.com → Project Settings → API:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # Keep this secret!
```

### 3.3 Configure Redis

```bash
# For Upstash
UPSTASH_REDIS_REST_URL=https://your-region.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# BullMQ queue worker (required in production)
BULLMQ_REDIS_URL=rediss://default:password@your-region.upstash.io:6379

# OR for local Redis
BULLMQ_REDIS_URL=redis://localhost:6379
```

### 3.4 Optional: Configure Payment Gateway

**For Stripe:**

```bash
STRIPE_SECRET_KEY=sk_test_your_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
```

**For PayPal:**

```bash
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_CLIENT_SECRET=your_client_secret
```

---

## Step 4: Test Authentication

### 4.1 Create Test User

Use Supabase dashboard or API:

```bash
# Via Supabase Dashboard
# Go to Authentication → Users → Add User
# Create test user: test@example.com
```

### 4.2 Test Auth Middleware

Create `scripts/test-auth.mjs`:

```javascript
const testAuth = async () => {
  const response = await fetch('http://localhost:3000/api/booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'get_slots',
      payload: { date: '2025-11-22' }
    })
  });
  
  const data = await response.json();
  
  if (response.status === 401) {
    console.log('✅ Authentication working - got 401 Unauthorized');
  } else {
    console.log('❌ Authentication not working - expected 401, got:', response.status);
  }
};

testAuth();
```

Run:

```bash
npm run dev
# In another terminal:
node scripts/test-auth.mjs
```

Expected output: `✅ Authentication working - got 401 Unauthorized`

---

## Step 5: Test Rate Limiting

### 5.1 Test Rate Limit

Create `scripts/test-rate-limit.mjs`:

```javascript
const testRateLimit = async () => {
  console.log('Testing rate limiting...');
  
  for (let i = 1; i <= 105; i++) {
    const response = await fetch('http://localhost:3000/api/booking', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': 'test-user-123'
      },
      body: JSON.stringify({
        action: 'get_slots',
        payload: { date: '2025-11-22' }
      })
    });
    
    if (response.status === 429) {
      console.log(`✅ Rate limit hit at request ${i}`);
      const data = await response.json();
      console.log('Rate limit response:', data);
      break;
    }
    
    if (i % 20 === 0) {
      console.log(`Sent ${i} requests...`);
    }
  }
};

testRateLimit();
```

Run:

```bash
node scripts/test-rate-limit.mjs
```

Expected: Rate limit hit around request 100-105

---

## Step 6: Production Deployment

### 6.1 Set Environment Variables in Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add UPSTASH_REDIS_URL production
vercel env add UPSTASH_REDIS_TOKEN production

# Optional: Payment gateway
vercel env add STRIPE_SECRET_KEY production
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
```

### 6.2 Deploy

```bash
# Build locally first
npm run build

# Deploy to production
vercel --prod
```

### 6.3 Verify Production Deployment

Test endpoints:

```bash
# Should return 401 (authentication required)
curl -X POST https://your-domain.vercel.app/api/booking \
  -H "Content-Type: application/json" \
  -d '{"action":"get_slots","payload":{"date":"2025-11-22"}}'

# Should see rate limit headers
curl -I https://your-domain.vercel.app/api/booking
```

---

## Step 7: Monitoring Setup (Optional but Recommended)

### 7.1 Set Up Error Tracking

**Sentry:**

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Add to environment:

```bash
SENTRY_DSN=https://your_key@sentry.io/your_project
```

**Datadog:**

```bash
npm install @datadog/browser-logs
```

Add to environment:

```bash
DATADOG_API_KEY=your_key
DATADOG_APP_KEY=your_app_key
```

### 7.2 Set Up Uptime Monitoring

Use services like:
- Pingdom (https://www.pingdom.com)
- UptimeRobot (https://uptimerobot.com)
- Better Uptime (https://betteruptime.com)

Monitor these endpoints:
- `GET /api/health` (create a health check endpoint)
- `POST /api/booking`
- `GET /api/analytics/scores`

---

## Step 8: Create Health Check Endpoint

Create `src/app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRedisClient } from '@/middleware/rate-limit';

export async function GET() {
  const status = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {
      database: 'checking',
      redis: 'checking'
    }
  };

  // Check database
  try {
    const supabase = createClient();
    const { error } = await supabase.from('tenants').select('id').limit(1);
    status.checks.database = error ? 'unhealthy' : 'healthy';
  } catch (error) {
    status.checks.database = 'unhealthy';
    status.status = 'degraded';
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    await redis.ping();
    status.checks.redis = 'healthy';
  } catch (error) {
    status.checks.redis = 'unhealthy';
    status.status = 'degraded';
  }

  const httpStatus = status.status === 'healthy' ? 200 : 503;
  return NextResponse.json(status, { status: httpStatus });
}
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Check Supabase connection
node scripts/test-supabase.mjs

# Verify environment variables
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Redis Connection Issues

```bash
# Test Redis locally
redis-cli ping

# Check Redis logs
redis-server --loglevel verbose

# For Upstash, check console: https://console.upstash.com
```

### Authentication Not Working

```bash
# Verify Supabase Auth is enabled
# Dashboard → Authentication → Settings → Enable Email

# Check if tenant_users table exists
# Dashboard → SQL Editor → Run:
SELECT * FROM public.tenant_users LIMIT 1;
```

### Rate Limiting Not Working

```bash
# Verify Redis is running
redis-cli ping

# Check environment variable
echo $REDIS_URL
echo $UPSTASH_REDIS_URL

# Enable debug logging in middleware
# Add to rate-limit.ts:
console.log('Redis client status:', redis.status);
```

---

## Security Checklist

Before going to production, ensure:

- [ ] All environment variables are set in Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is kept secret (not in client code)
- [ ] Row Level Security (RLS) is enabled on all tables
- [ ] Rate limiting is working (test with curl)
- [ ] Authentication is required on all sensitive endpoints
- [ ] HTTPS is enforced (Vercel does this automatically)
- [ ] Error messages don't leak sensitive information
- [ ] Monitoring and alerting are set up

---

## Next Steps

1. **Test all API endpoints** with authentication tokens
2. **Set up monitoring** (Sentry, Datadog, or similar)
3. **Configure email notifications** (Resend, SendGrid)
4. **Add comprehensive logging** (structured JSON logs)
5. **Set up CI/CD pipeline** (GitHub Actions)
6. **Write integration tests** (Playwright, Vitest)
7. **Perform load testing** (k6, Artillery)
8. **Create runbook** for incident response

---

## Support

For issues or questions:
- Check documentation: `docs/PRODUCTION_HARDENING.md`
- Review security guide: `docs/SECURITY_HARDENING_GUIDE.md`
- Check database plan: `docs/DATABASE_MIGRATION_PLAN.md`

---

**Setup Complete!** 🎉

Your production infrastructure is now ready with:
✅ Database persistence (Supabase)
✅ Authentication & authorization
✅ Rate limiting (Redis)
✅ Security hardening
✅ Error handling
✅ Tenant isolation

Monitor your application and scale as needed!
