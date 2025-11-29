# Production Hardening - Quick Reference

## Overview
This quick reference provides essential information for deploying Phase 3 & Phase 4 features to production.

---

## Quality Score: **8.5/10** → **10/10**

### Current State
✅ All features implemented  
✅ Comprehensive error handling  
✅ Input validation everywhere  
✅ Type-safe code (0 compile errors)  
✅ Unit tests passing (100%)  

### Blocking Issues (4)
❌ Database persistence (in-memory storage)  
❌ Payment gateway (mock only)  
❌ Authentication (no auth)  
❌ Rate limiting (no protection)  

---

## Critical Files Enhanced

### Core Libraries (5)
1. `src/lib/healthcare/compliance.ts` - HIPAA PHI detection
2. `src/lib/booking/calendar.ts` - Appointment booking
3. `src/lib/analytics/scoring.ts` - Conversation scoring
4. `src/lib/analytics/metrics.ts` - Metrics recording
5. `src/lib/ecommerce/checkout.ts` - Payment processing

### API Routes (4)
1. `src/app/api/booking/route.ts`
2. `src/app/api/analytics/scoring/route.ts`
3. `src/app/api/analytics/metrics/route.ts`
4. `src/app/api/ecommerce/checkout/route.ts`

---

## Error Classes (5)

| Class | Error Codes | Usage |
|-------|-------------|-------|
| `HIPAAComplianceError` | INVALID_INPUT, PHI_DETECTED, MASKING_FAILED, UNKNOWN | Healthcare compliance violations |
| `BookingError` | SLOT_UNAVAILABLE, INVALID_INPUT, DB_ERROR, UNKNOWN | Booking failures |
| `ScoringError` | INVALID_INPUT, DB_ERROR, UNKNOWN | Analytics scoring errors |
| `MetricsError` | INVALID_INPUT, DB_ERROR, UNKNOWN | Metrics recording errors |
| `CheckoutError` | INVALID_INPUT, PAYMENT_FAILED, DB_ERROR, UNKNOWN | Payment processing errors |

---

## API Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { /* optional context */ }
}
```

### Common HTTP Status Codes
- `400` - Invalid input (INVALID_INPUT)
- `401` - Authentication required (AUTH_REQUIRED)
- `402` - Payment required/failed (PAYMENT_FAILED)
- `403` - Forbidden (TENANT_ACCESS_DENIED)
- `409` - Conflict (SLOT_UNAVAILABLE)
- `429` - Rate limit exceeded (RATE_LIMIT_EXCEEDED)
- `500` - Server error (DB_ERROR, UNKNOWN)

---

## Quick Start: Resolve Blocking Issues

### 1. Database Integration (2 days)

**Step 1**: Create migration
```bash
cd supabase
supabase migration new add_phase3_phase4_tables
```

**Step 2**: Copy schema from `docs/DATABASE_MIGRATION_PLAN.md` section 2

**Step 3**: Apply migration
```bash
supabase db push
```

**Step 4**: Update code (example for booking):
```typescript
// OLD
const BOOKINGS: Booking[] = [];
export function bookAppointment(...) {
  BOOKINGS.push(booking);
}

// NEW
export async function bookAppointment(...) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('bookings')
    .insert({ slot_id: slotId, ... })
    .select()
    .single();
  if (error) throw new BookingError('DB error', 'DB_ERROR', error);
  return data;
}
```

### 2. Authentication (1 day)

**Step 1**: Create `src/middleware/auth.ts`
```typescript
import { createClient } from '@/lib/supabase/server';

export async function requireAuth(req: Request) {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }
  
  return { session, user: session.user };
}
```

**Step 2**: Apply to API routes
```typescript
export async function POST(req: Request) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  
  // Continue with request...
}
```

### 3. Rate Limiting (1 day)

**Step 1**: Install Upstash
```bash
npm install @upstash/ratelimit @upstash/redis
```

**Step 2**: Create `src/middleware/rate-limit.ts`
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

export const bookingRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m')
});
```

**Step 3**: Apply to API routes
```typescript
export async function POST(req: Request) {
  const identifier = req.headers.get('x-user-id') || 'anonymous';
  const { success } = await bookingRateLimit.limit(identifier);
  
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }
  
  // Continue...
}
```

### 4. Payment Gateway (2 days, for e-commerce)

**Step 1**: Install Stripe
```bash
npm install stripe @stripe/stripe-js
```

**Step 2**: Update `src/lib/ecommerce/checkout.ts`
```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

export async function processPayment(amount, currency, paymentMethodId) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      payment_method: paymentMethodId,
      confirm: true,
      return_url: `${process.env.NEXT_PUBLIC_URL}/order/confirm`
    });
    
    return {
      success: paymentIntent.status === 'succeeded',
      transactionId: paymentIntent.id
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      errorCode: 'GATEWAY_ERROR'
    };
  }
}
```

---

## Testing Checklist

### Before Deployment
- [ ] Run unit tests: `npm test`
- [ ] Check TypeScript: `npm run type-check`
- [ ] Run linter: `npm run lint`
- [ ] Test locally: `npm run dev`
- [ ] Test database migrations: `supabase migration up`
- [ ] Test authentication flow
- [ ] Test rate limiting (use curl/Postman)
- [ ] Test payment flow (Stripe test mode)

### After Deployment
- [ ] Smoke test all API endpoints
- [ ] Check error tracking (Sentry/Datadog)
- [ ] Monitor database connections
- [ ] Verify rate limiting works
- [ ] Test authentication works
- [ ] Process test payment
- [ ] Check logs for errors

---

## Environment Variables Checklist

### Required for Production
```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG... # KEEP SECRET!

# Rate Limiting
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=AXX... # KEEP SECRET!

# Payment (if using e-commerce)
STRIPE_SECRET_KEY=sk_live_... # KEEP SECRET!
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Monitoring (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
DATADOG_API_KEY=xxx # KEEP SECRET!

# Email (optional)
RESEND_API_KEY=re_xxx # KEEP SECRET!
```

---

## Monitoring & Alerting

### Key Metrics to Monitor
1. **API Latency** (p50, p95, p99)
   - Alert if p99 > 1000ms

2. **Error Rate**
   - Alert if error rate > 5%

3. **Database Connection Pool**
   - Alert if utilization > 80%

4. **Rate Limit Hit Rate**
   - Alert if > 10% requests rate limited

5. **Payment Success Rate** (if e-commerce)
   - Alert if success rate < 95%

### Log Aggregation
Use structured logging:
```typescript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'error',
  service: 'booking-api',
  error: error.message,
  errorCode: error.code,
  userId: user.id,
  tenantId: tenantId
}));
```

---

## Security Checklist

### Before Production
- [ ] All secrets in environment variables (not hardcoded)
- [ ] HTTPS enforced
- [ ] Authentication required on all API routes
- [ ] Rate limiting active
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (using Supabase client)
- [ ] XSS protection (sanitize user inputs)
- [ ] CSRF tokens (for non-GET requests)
- [ ] Security headers configured (in `next.config.ts`)
- [ ] Audit logging enabled (for HIPAA/compliance)
- [ ] Database RLS policies enabled
- [ ] Error messages don't leak sensitive data

---

## Rollback Plan

### If Deployment Fails
1. Revert to previous version:
   ```bash
   vercel rollback
   ```

2. If database migration fails:
   ```bash
   supabase db reset
   # Re-run previous migration
   ```

3. Check logs for errors:
   ```bash
   vercel logs
   ```

### Data Recovery
- Database: Supabase has automatic backups (7 days)
- Files: Vercel keeps deployment history

---

## Support & Documentation

### Full Documentation
- `PRODUCTION_QUALITY_AUDIT.md` - Complete audit report
- `docs/PRODUCTION_HARDENING.md` - Enhancement details
- `docs/DATABASE_MIGRATION_PLAN.md` - Database setup guide
- `docs/SECURITY_HARDENING_GUIDE.md` - Security implementation

### External Resources
- Supabase: https://supabase.com/docs
- Stripe: https://stripe.com/docs/api
- Upstash: https://upstash.com/docs/redis
- Next.js Security: https://nextjs.org/docs/advanced-features/security

---

## Timeline Estimate

| Task | Effort | Priority |
|------|--------|----------|
| Database integration | 2 days | 🔴 Critical |
| Authentication | 1 day | 🔴 Critical |
| Rate limiting | 1 day | 🔴 Critical |
| Payment gateway | 2 days | 🔴 Critical (if e-commerce) |
| Monitoring setup | 1 day | 🟠 High |
| Audit logging | 1 day | 🟠 High |
| Email notifications | 1 day | 🟠 High |
| Integration tests | 2 days | 🟡 Medium |
| Security tests | 1 day | 🟡 Medium |
| Load testing | 1 day | 🟡 Medium |

**Total**: 1-2 weeks for blocking issues, 1 month for complete 10/10 quality

---

## Quick Commands

```bash
# Development
npm run dev                 # Start dev server
npm test                    # Run unit tests
npm run type-check          # Check TypeScript
npm run lint                # Run linter

# Database
supabase start              # Start local Supabase
supabase migration new      # Create new migration
supabase db push            # Apply migrations to remote

# Deployment
vercel --prod               # Deploy to production
vercel logs                 # View production logs
vercel rollback             # Rollback deployment

# Testing
npm run test:integration    # Run integration tests (add this)
npm run test:e2e            # Run E2E tests (add this)
```

---

**Last Updated**: January 2025  
**Status**: Ready for implementation  
**Next Action**: Resolve 4 blocking issues (database, auth, rate limit, payment)
