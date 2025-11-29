# Security Hardening Guide

## Overview

This guide provides comprehensive security measures for Phase 3 and Phase 4 features, addressing the critical production requirements identified during quality audit.

---

## 1. Authentication & Authorization

### Current State
❌ No authentication middleware
❌ No authorization checks
❌ No session validation

### Implementation Plan

#### Step 1: Add Auth Middleware

**File**: `src/middleware/auth.ts`
```typescript
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function requireAuth(req: NextRequest) {
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

export async function requireTenantAccess(
  req: NextRequest, 
  tenantId: string
) {
  const { session } = await requireAuth(req);
  
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (error || !data) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'TENANT_ACCESS_DENIED' },
      { status: 403 }
    );
  }
  
  return { session, user: session.user, role: data.role };
}
```

#### Step 2: Apply to API Routes

**Example**: `src/app/api/booking/route.ts`
```typescript
import { requireAuth, requireTenantAccess } from '@/middleware/auth';

export async function POST(req: Request) {
  // 1. Authenticate user
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  
  const { user } = authResult;
  
  // 2. Extract tenant ID from request
  const body = await req.json();
  const tenantId = body.tenantId || req.headers.get('x-tenant-id');
  
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant ID required', code: 'INVALID_INPUT' },
      { status: 400 }
    );
  }
  
  // 3. Verify tenant access
  const tenantResult = await requireTenantAccess(req, tenantId);
  if (tenantResult instanceof NextResponse) return tenantResult;
  
  // 4. Proceed with booking logic
  const booking = await bookAppointment(
    slotId,
    { name, email, userId: user.id },
    { tenantId }
  );
  
  return NextResponse.json({ booking });
}
```

---

## 2. Rate Limiting

### Current State
❌ No rate limiting
❌ DDoS vulnerable
❌ Abuse potential

### Implementation Plan

#### Option 1: Redis-Based Rate Limiting

**File**: `src/middleware/rate-limit.ts`
```typescript
import { Redis } from 'ioredis';
import { NextRequest, NextResponse } from 'next/server';

const redis = new Redis(process.env.REDIS_URL!);

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
}

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  // Get identifier (user ID or IP)
  const identifier = req.headers.get('x-user-id') || 
                     req.headers.get('x-forwarded-for') || 
                     'anonymous';
                     
  const key = `${config.keyPrefix}:${identifier}`;
  
  try {
    // Increment counter
    const current = await redis.incr(key);
    
    // Set expiration on first request
    if (current === 1) {
      await redis.expire(key, config.windowSeconds);
    }
    
    // Check limit
    if (current > config.maxRequests) {
      const ttl = await redis.ttl(key);
      
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded', 
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: ttl
        },
        { 
          status: 429,
          headers: {
            'Retry-After': ttl.toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': (Date.now() + ttl * 1000).toString()
          }
        }
      );
    }
    
    // Add rate limit headers
    const remaining = config.maxRequests - current;
    const ttl = await redis.ttl(key);
    
    // Continue request (no error response)
    return null;
  } catch (error) {
    console.error('Rate limit error:', error);
    // Fail open (allow request on error)
    return null;
  }
}

// Preset configurations
export const RATE_LIMITS = {
  // API endpoints
  booking: { maxRequests: 100, windowSeconds: 60, keyPrefix: 'booking' },
  checkout: { maxRequests: 10, windowSeconds: 3600, keyPrefix: 'checkout' },
  metrics: { maxRequests: 10000, windowSeconds: 3600, keyPrefix: 'metrics' },
  
  // Authentication
  login: { maxRequests: 5, windowSeconds: 300, keyPrefix: 'login' },
  signup: { maxRequests: 3, windowSeconds: 3600, keyPrefix: 'signup' }
};
```

#### Apply to API Routes

**Example**: `src/app/api/booking/route.ts`
```typescript
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

export async function POST(req: Request) {
  // 1. Check rate limit
  const rateLimitResponse = await rateLimit(req, RATE_LIMITS.booking);
  if (rateLimitResponse) return rateLimitResponse;
  
  // 2. Continue with request
  // ...existing logic
}
```

#### Option 2: Upstash Rate Limiting (Serverless-Friendly)

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
  analytics: true
});

export async function POST(req: Request) {
  const identifier = req.headers.get('x-user-id') || 'anonymous';
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);
  
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }
  
  // Continue...
}
```

---

## 3. Input Validation & Sanitization

### Current State
✅ Basic validation implemented
⚠️ Needs schema validation
⚠️ Needs XSS protection

### Enhancement Plan

#### Step 1: Add Zod Schema Validation

**File**: `src/lib/validation/schemas.ts`
```typescript
import { z } from 'zod';

export const BookingSchema = z.object({
  slotId: z.string().min(1).max(255),
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid()
});

export const OrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    price: z.number().positive()
  })).min(1),
  total: z.number().positive().max(1000000),
  currency: z.string().length(3),
  paymentMethodId: z.string().min(1),
  customerEmail: z.string().email().optional(),
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string()
  }).optional(),
  tenantId: z.string().uuid()
});

export const MetricSchema = z.object({
  name: z.string().min(1).max(100).toLowerCase().trim(),
  value: z.number().finite(),
  tags: z.record(z.string()).optional(),
  tenantId: z.string().uuid()
});

export const ScoringSchema = z.object({
  sessionId: z.string().min(1).max(255),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).min(1),
  feedback: z.string().max(1000).optional(),
  tenantId: z.string().uuid()
});
```

#### Step 2: Apply Validation in API Routes

**Example**: `src/app/api/booking/route.ts`
```typescript
import { BookingSchema } from '@/lib/validation/schemas';
import { ZodError } from 'zod';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate input
    const validated = BookingSchema.parse(body);
    
    // Use validated data
    const booking = await bookAppointment(
      validated.slotId,
      { 
        name: validated.name, 
        email: validated.email, 
        userId: validated.userId 
      },
      { tenantId: validated.tenantId }
    );
    
    return NextResponse.json({ booking });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          code: 'INVALID_INPUT',
          details: error.errors
        },
        { status: 400 }
      );
    }
    // Handle other errors
  }
}
```

#### Step 3: XSS Protection

**File**: `src/lib/security/sanitize.ts`
```typescript
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // Strip all HTML
    ALLOWED_ATTR: []
  });
}

export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    return sanitizeHtml(input);
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}
```

---

## 4. SQL Injection Prevention

### Current State
✅ Using Supabase client (parameterized queries)
✅ No raw SQL in application code

### Best Practices

```typescript
// ✅ GOOD: Parameterized query (Supabase handles escaping)
const { data } = await supabase
  .from('bookings')
  .select('*')
  .eq('slot_id', slotId)  // Automatically escaped
  .eq('tenant_id', tenantId);

// ❌ BAD: Raw SQL (never do this)
const { data } = await supabase.rpc('custom_query', {
  query: `SELECT * FROM bookings WHERE slot_id = '${slotId}'`  // Vulnerable!
});

// ✅ GOOD: If you must use raw SQL, use parameterized queries
const { data } = await supabase.rpc('custom_query', {
  p_slot_id: slotId,  // Passed as parameter
  p_tenant_id: tenantId
});
```

---

## 5. CSRF Protection

### Implementation Plan

**File**: `src/middleware/csrf.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const CSRF_TOKEN_COOKIE = 'csrf-token';
const CSRF_TOKEN_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function verifyCsrfToken(req: NextRequest): Promise<NextResponse | null> {
  // Skip for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return null;
  }
  
  const cookieToken = req.cookies.get(CSRF_TOKEN_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_TOKEN_HEADER);
  
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return NextResponse.json(
      { error: 'Invalid CSRF token', code: 'CSRF_VALIDATION_FAILED' },
      { status: 403 }
    );
  }
  
  return null;
}
```

**Usage in API Routes**:
```typescript
import { verifyCsrfToken } from '@/middleware/csrf';

export async function POST(req: Request) {
  // Check CSRF token
  const csrfError = await verifyCsrfToken(req);
  if (csrfError) return csrfError;
  
  // Continue...
}
```

---

## 6. Secrets Management

### Current State
⚠️ Using environment variables
⚠️ No secrets rotation
⚠️ No encryption at rest

### Best Practices

#### Development
```bash
# .env.local (never commit!)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
STRIPE_SECRET_KEY=sk_test_...
```

#### Production
Use a secrets manager:

**Option 1: Vercel Environment Variables**
```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

**Option 2: HashiCorp Vault**
```typescript
import vault from 'node-vault';

const client = vault({ 
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN 
});

const secrets = await client.read('secret/data/chatbot');
const stripeKey = secrets.data.data.STRIPE_SECRET_KEY;
```

**Option 3: AWS Secrets Manager**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });
const response = await client.send(
  new GetSecretValueCommand({ SecretId: 'chatbot/production' })
);
const secrets = JSON.parse(response.SecretString);
```

#### Secrets Rotation
```typescript
// Rotate API keys every 90 days
export async function rotateStripeKey() {
  // 1. Generate new key in Stripe dashboard
  // 2. Update in secrets manager
  // 3. Deploy new version
  // 4. Revoke old key after 24 hours
}
```

---

## 7. Encryption

### Data at Rest
✅ Supabase encrypts database at rest (AES-256)
✅ Backups are encrypted

### Data in Transit
✅ HTTPS enforced (TLS 1.2+)
⚠️ Need to enforce HTTPS in middleware

**File**: `middleware.ts`
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Enforce HTTPS
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'http') {
    return NextResponse.redirect(
      `https://${request.headers.get('host')}${request.nextUrl.pathname}`,
      301
    );
  }
  
  return NextResponse.next();
}
```

### Sensitive Data Encryption
```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, encryptedText] = encrypted.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

---

## 8. Audit Logging

### Implementation Plan

**File**: `src/lib/audit/logger.ts`
```typescript
import { createClient } from '@/lib/supabase/server';

export interface AuditLog {
  userId?: string;
  tenantId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: any;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure';
  errorMessage?: string;
}

export async function logAudit(log: AuditLog) {
  const supabase = createClient();
  
  await supabase.from('audit_logs').insert({
    user_id: log.userId,
    tenant_id: log.tenantId,
    action: log.action,
    resource: log.resource,
    resource_id: log.resourceId,
    changes: log.changes,
    ip_address: log.ipAddress,
    user_agent: log.userAgent,
    status: log.status,
    error_message: log.errorMessage,
    created_at: new Date().toISOString()
  });
}

// Usage
await logAudit({
  userId: user.id,
  tenantId,
  action: 'booking.create',
  resource: 'booking',
  resourceId: booking.id,
  ipAddress: req.headers.get('x-forwarded-for'),
  status: 'success'
});
```

---

## 9. Security Headers

**File**: `next.config.ts`
```typescript
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  },
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self' data:;
      connect-src 'self' https://*.supabase.co;
      frame-ancestors 'self';
    `.replace(/\s{2,}/g, ' ').trim()
  }
];

const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
```

---

## 10. Security Testing

### Automated Security Scanning

**Install Dependencies**:
```bash
npm install -D @playwright/test zap-api
```

**Security Test Suite**: `tests/security/injection.test.ts`
```typescript
import { test, expect } from '@playwright/test';

test.describe('SQL Injection Tests', () => {
  test('should prevent SQL injection in booking API', async ({ request }) => {
    const malicious = "'; DROP TABLE bookings; --";
    
    const response = await request.post('/api/booking', {
      data: {
        slotId: malicious,
        name: 'Test',
        email: 'test@example.com',
        tenantId: '...'
      }
    });
    
    expect(response.status()).toBe(400); // Should be rejected
    // Verify table still exists
    const check = await request.get('/api/booking?date=2025-01-15');
    expect(check.ok()).toBeTruthy();
  });
});

test.describe('XSS Tests', () => {
  test('should sanitize HTML in user input', async ({ request }) => {
    const xss = '<script>alert("XSS")</script>';
    
    const response = await request.post('/api/booking', {
      data: {
        slotId: 'slot_123',
        name: xss,
        email: 'test@example.com',
        tenantId: '...'
      }
    });
    
    const booking = await response.json();
    expect(booking.booking.user_name).not.toContain('<script>');
  });
});
```

---

## Conclusion

This security hardening guide provides:
✅ Authentication & authorization
✅ Rate limiting
✅ Input validation & sanitization
✅ SQL injection prevention
✅ CSRF protection
✅ Secrets management
✅ Encryption
✅ Audit logging
✅ Security headers
✅ Security testing

**Implementation Priority**:
1. **Critical**: Authentication, rate limiting, input validation
2. **High**: CSRF protection, audit logging, security headers
3. **Medium**: Secrets rotation, comprehensive testing

**Estimated Timeline**: 1-2 weeks for critical items, 1 month for complete implementation.
