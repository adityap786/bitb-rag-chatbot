# Security Hardening - Immediate & Critical Implementation Plan

**Priority**: 🔴 MUST-DO BEFORE PRODUCTION  
**Estimated Timeline**: 2-3 weeks  
**Last Updated**: 2025-12-22

---

## Executive Summary

This document provides a detailed, production-grade implementation plan for all **immediate and critical** security tasks identified in the Security & GDPR Hardening Master Document. Each task includes specific implementation steps, code locations, verification criteria, and ownership.

---

## 🔴 Critical Tasks (Block Production Deployment)

### CRIT-01: Deploy WAF with OWASP CRS Rules

**Impact**: Protects all public endpoints from Layer 7 attacks  
**Owner**: Infrastructure/DevOps  
**Timeline**: 2-3 days

#### Implementation Steps

1. **Choose WAF Provider**
   ```
   Option A: Cloudflare Pro ($20/mo) - Recommended for startups
   Option B: AWS WAF + Shield ($5/mo + $3/rule)
   Option C: Vercel Enterprise (if already on Vercel)
   ```

2. **Configure OWASP CRS Rules**
   ```yaml
   # cloudflare-waf-rules.yaml
   rules:
     - name: "Block SQL Injection"
       expression: "(contains(http.request.uri.query, \"UNION\") or contains(http.request.uri.query, \"SELECT\"))"
       action: block
       
     - name: "Block XSS Attempts"
       expression: "contains(lower(http.request.uri.query), \"<script\")"
       action: block
       
     - name: "Rate Limit Widget API"
       expression: "http.request.uri.path contains \"/api/widget\" or http.request.uri.path contains \"/api/chat\""
       action: rate_limit
       rate: 100
       period: 60
   ```

3. **Custom Rules for Chatbot**
   - Block requests with injection markers in body
   - Rate limit by IP + tenant_id combination
   - Challenge suspicious user agents

4. **Verification**
   ```bash
   # Test SQL injection blocking
   curl -X POST "https://yourdomain.com/api/chat/ask" \
     -H "Content-Type: application/json" \
     -d '{"message": "SELECT * FROM users; DROP TABLE--"}'
   # Expected: 403 Forbidden
   ```

---

### CRIT-02: Configure Security Headers

**Impact**: Prevents XSS, clickjacking, MIME sniffing attacks  
**Owner**: Backend  
**Timeline**: 1 day

#### Implementation Steps

1. **Update `next.config.ts`**
   ```typescript
   // next.config.ts
   const securityHeaders = [
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
       value: [
         "default-src 'self'",
         "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
         "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
         "font-src 'self' https://fonts.gstatic.com",
         "img-src 'self' data: https: blob:",
         "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com",
         "frame-ancestors 'self'",
       ].join('; ')
     }
   ];

   const nextConfig = {
     async headers() {
       return [
         {
           source: '/:path*',
           headers: securityHeaders,
         },
         {
           // Allow widget embedding on any domain
           source: '/widget/:path*',
           headers: [
             ...securityHeaders.filter(h => h.key !== 'X-Frame-Options'),
             { key: 'X-Frame-Options', value: 'ALLOWALL' }
           ],
         }
       ];
     },
   };

   export default nextConfig;
   ```

2. **Verification**
   ```bash
   # Check headers are applied
   curl -I https://yourdomain.com/api/chat/ask
   # Should show all security headers
   ```

---

### CRIT-03: Implement Per-Bot Rate Limiting

**Impact**: Prevents single bot from exhausting tenant quota  
**Owner**: Backend  
**Timeline**: 2 days

#### Implementation Steps

1. **Create rate limit utility**
   ```typescript
   // src/lib/rate-limit/per-bot-limiter.ts
   import { Redis } from 'ioredis';
   
   const redis = new Redis(process.env.REDIS_URL!);
   
   interface RateLimitResult {
     allowed: boolean;
     remaining: number;
     resetAt: number;
   }
   
   export async function checkBotRateLimit(
     tenantId: string,
     chatbotId: string,
     ipAddress: string,
     limits: { perBot: number; perIP: number; windowSeconds: number }
   ): Promise<RateLimitResult> {
     const now = Math.floor(Date.now() / 1000);
     const window = Math.floor(now / limits.windowSeconds) * limits.windowSeconds;
     
     // Per-bot limit
     const botKey = `ratelimit:bot:${chatbotId}:${window}`;
     const botCount = await redis.incr(botKey);
     if (botCount === 1) await redis.expire(botKey, limits.windowSeconds + 1);
     
     // Per-IP limit
     const ipKey = `ratelimit:ip:${chatbotId}:${ipAddress}:${window}`;
     const ipCount = await redis.incr(ipKey);
     if (ipCount === 1) await redis.expire(ipKey, limits.windowSeconds + 1);
     
     const botAllowed = botCount <= limits.perBot;
     const ipAllowed = ipCount <= limits.perIP;
     
     return {
       allowed: botAllowed && ipAllowed,
       remaining: Math.min(limits.perBot - botCount, limits.perIP - ipCount),
       resetAt: window + limits.windowSeconds,
     };
   }
   ```

2. **Apply to chat endpoint**
   ```typescript
   // src/app/api/chat/ask/route.ts
   import { checkBotRateLimit } from '@/lib/rate-limit/per-bot-limiter';
   
   export async function POST(req: NextRequest) {
     const { tenant_id, chatbot_id } = await req.json();
     const ip = req.headers.get('x-forwarded-for') || 'unknown';
     
     const rateLimit = await checkBotRateLimit(tenant_id, chatbot_id, ip, {
       perBot: 1000,  // 1000 requests per bot per minute
       perIP: 20,     // 20 requests per IP per minute
       windowSeconds: 60,
     });
     
     if (!rateLimit.allowed) {
       return NextResponse.json(
         { error: 'Rate limit exceeded', retryAfter: rateLimit.resetAt - Date.now()/1000 },
         { 
           status: 429,
           headers: {
             'Retry-After': String(rateLimit.resetAt - Math.floor(Date.now()/1000)),
             'X-RateLimit-Remaining': String(Math.max(0, rateLimit.remaining)),
           }
         }
       );
     }
     
     // Continue with chat logic...
   }
   ```

3. **Verification**
   ```bash
   # Rapid-fire test
   for i in {1..25}; do
     curl -X POST "https://yourdomain.com/api/chat/ask" \
       -H "Content-Type: application/json" \
       -d '{"tenant_id":"test","chatbot_id":"bot1","message":"hi"}' &
   done
   wait
   # Should see 429 responses after limit hit
   ```

---

### CRIT-04: Implement GDPR Data Export Endpoint

**Impact**: GDPR compliance requirement - Right to Access  
**Owner**: Backend  
**Timeline**: 2 days

#### Implementation Steps

1. **Create export endpoint**
   ```typescript
   // src/app/api/gdpr/export/route.ts
   import { createClient } from '@/lib/supabase/server';
   import { NextRequest, NextResponse } from 'next/server';
   import { requireAuth, requireTenantAccess } from '@/middleware/auth';
   
   export async function GET(req: NextRequest) {
     // 1. Auth & tenant check
     const authResult = await requireAuth(req);
     if (authResult instanceof NextResponse) return authResult;
     
     const tenantId = req.headers.get('x-tenant-id');
     const userId = req.nextUrl.searchParams.get('user_id');
     
     if (!tenantId || !userId) {
       return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
     }
     
     const tenantResult = await requireTenantAccess(req, tenantId);
     if (tenantResult instanceof NextResponse) return tenantResult;
     
     const supabase = createClient();
     
     // 2. Set tenant context for RLS
     await supabase.rpc('set_tenant_context', { p_tenant_id: tenantId });
     
     // 3. Gather all user data
     const [chatSessions, documents, auditLogs] = await Promise.all([
       supabase
         .from('chat_sessions')
         .select('id, created_at, messages')
         .eq('tenant_id', tenantId)
         .eq('user_id', userId),
       
       supabase
         .from('knowledge_base')
         .select('id, filename, source_type, created_at')
         .eq('tenant_id', tenantId)
         .eq('uploaded_by', userId),
       
       supabase
         .from('rag_audit_log')
         .select('created_at, query_hash, chunks_returned, latency_ms')
         .eq('tenant_id', tenantId)
         .eq('user_id', userId),
     ]);
     
     // 4. Build export package
     const exportData = {
       export_date: new Date().toISOString(),
       tenant_id: tenantId,
       user_id: userId,
       data: {
         chat_sessions: chatSessions.data || [],
         documents_uploaded: documents.data || [],
         activity_logs: auditLogs.data || [],
       },
       metadata: {
         total_chats: chatSessions.data?.length || 0,
         total_documents: documents.data?.length || 0,
         total_queries: auditLogs.data?.length || 0,
       }
     };
     
     // 5. Return as downloadable JSON
     return new NextResponse(JSON.stringify(exportData, null, 2), {
       headers: {
         'Content-Type': 'application/json',
         'Content-Disposition': `attachment; filename="gdpr-export-${userId}-${Date.now()}.json"`,
       }
     });
   }
   ```

2. **Add to admin dashboard UI** (optional - can be manual API call initially)

3. **Verification**
   ```bash
   curl -X GET "https://yourdomain.com/api/gdpr/export?user_id=USER_ID" \
     -H "Authorization: Bearer TOKEN" \
     -H "x-tenant-id: TENANT_ID" \
     -o export.json
   # Should download JSON file with all user data
   ```

---

### CRIT-05: Implement GDPR Data Deletion Endpoint

**Impact**: GDPR compliance requirement - Right to Erasure  
**Owner**: Backend  
**Timeline**: 2 days

#### Implementation Steps

1. **Create deletion database function**
   ```sql
   -- supabase/migrations/YYYYMMDD_gdpr_delete_function.sql
   CREATE OR REPLACE FUNCTION gdpr_delete_user_data(
     p_tenant_id TEXT,
     p_user_id TEXT
   ) RETURNS JSON AS $$
   DECLARE
     deleted_chats INT;
     deleted_docs INT;
     deleted_embeddings INT;
   BEGIN
     -- Delete chat sessions
     DELETE FROM chat_sessions 
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
     GET DIAGNOSTICS deleted_chats = ROW_COUNT;
     
     -- Delete embeddings for user's documents
     DELETE FROM embeddings 
     WHERE tenant_id = p_tenant_id AND document_id IN (
       SELECT id FROM knowledge_base 
       WHERE tenant_id = p_tenant_id AND uploaded_by = p_user_id
     );
     GET DIAGNOSTICS deleted_embeddings = ROW_COUNT;
     
     -- Delete documents
     DELETE FROM knowledge_base 
     WHERE tenant_id = p_tenant_id AND uploaded_by = p_user_id;
     GET DIAGNOSTICS deleted_docs = ROW_COUNT;
     
     -- Anonymize audit logs (keep for compliance, remove PII)
     UPDATE rag_audit_log 
     SET user_id = 'GDPR_DELETED', 
         query_hash = NULL,
         metadata = metadata - 'user_agent' - 'ip_address'
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
     
     -- Log the deletion
     INSERT INTO gdpr_deletion_log (tenant_id, user_id, deleted_at, summary)
     VALUES (
       p_tenant_id, 
       p_user_id, 
       NOW(),
       jsonb_build_object(
         'chats', deleted_chats,
         'documents', deleted_docs,
         'embeddings', deleted_embeddings
       )
     );
     
     RETURN jsonb_build_object(
       'success', true,
       'deleted', jsonb_build_object(
         'chat_sessions', deleted_chats,
         'documents', deleted_docs,
         'embeddings', deleted_embeddings
       )
     );
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;
   ```

2. **Create API endpoint**
   ```typescript
   // src/app/api/gdpr/delete/route.ts
   import { createClient } from '@/lib/supabase/server';
   import { NextRequest, NextResponse } from 'next/server';
   import { requireAuth, requireTenantAdmin } from '@/middleware/auth';
   
   export async function DELETE(req: NextRequest) {
     // 1. Require admin access
     const authResult = await requireAuth(req);
     if (authResult instanceof NextResponse) return authResult;
     
     const { tenant_id, user_id, confirmation } = await req.json();
     
     // 2. Require explicit confirmation
     if (confirmation !== `DELETE_USER_${user_id}`) {
       return NextResponse.json(
         { error: 'Confirmation required. Set confirmation to DELETE_USER_<user_id>' },
         { status: 400 }
       );
     }
     
     // 3. Verify admin access to tenant
     const adminResult = await requireTenantAdmin(req, tenant_id);
     if (adminResult instanceof NextResponse) return adminResult;
     
     const supabase = createClient();
     
     // 4. Execute deletion
     const { data, error } = await supabase.rpc('gdpr_delete_user_data', {
       p_tenant_id: tenant_id,
       p_user_id: user_id
     });
     
     if (error) {
       console.error('GDPR deletion failed:', error);
       return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
     }
     
     // 5. Log for compliance
     console.info('GDPR deletion completed:', { tenant_id, user_id, result: data });
     
     return NextResponse.json(data);
   }
   ```

3. **Create deletion log table**
   ```sql
   CREATE TABLE gdpr_deletion_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     summary JSONB,
     requested_by TEXT
   );
   
   -- Make immutable
   ALTER TABLE gdpr_deletion_log ENABLE ROW LEVEL SECURITY;
   CREATE POLICY no_update ON gdpr_deletion_log FOR UPDATE USING (false);
   CREATE POLICY no_delete ON gdpr_deletion_log FOR DELETE USING (false);
   ```

4. **Verification**
   ```bash
   curl -X DELETE "https://yourdomain.com/api/gdpr/delete" \
     -H "Authorization: Bearer ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tenant_id":"tn_xxx","user_id":"user123","confirmation":"DELETE_USER_user123"}'
   # Should return deletion summary
   ```

---

### CRIT-06: Rotate All Secrets (Initial Production Setup)

**Impact**: Ensures no development secrets leak to production  
**Owner**: DevOps/Security  
**Timeline**: 1 day

#### Implementation Steps

1. **Generate new production secrets**
   ```bash
   # JWT Secret (256 bits)
   openssl rand -base64 32
   
   # Webhook Secret  
   openssl rand -hex 32
   
   # Encryption Key (AES-256)
   openssl rand -hex 32
   ```

2. **Secrets to rotate**

   | Secret | Rotation Action |
   |--------|-----------------|
   | `SUPABASE_SERVICE_ROLE_KEY` | Generate new in Supabase dashboard |
   | `GROQ_API_KEY` | Create new key in Groq console |
   | `REDIS_PASSWORD` | Update in Redis config + env |
   | `JWT_SECRET` | Generate new, update env |
   | `WEBHOOK_SECRET` | Generate new for each tenant |

3. **Update in production environment**
   ```bash
   # Vercel
   vercel env add JWT_SECRET production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   # etc.
   
   # Or via Vercel dashboard
   ```

4. **Verification**
   - Application starts without errors
   - Auth flows work correctly
   - Existing sessions invalidated (expected)

---

## 🟠 High Priority Tasks (Complete Within 30 Days)

### HIGH-01: Implement Webhook Signature Verification

**Location**: `src/app/api/webhooks/*/route.ts`  
**Owner**: Backend  
**Timeline**: 1 day

```typescript
// src/lib/webhooks/verify-signature.ts
import crypto from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  const MAX_AGE = 5 * 60 * 1000; // 5 minutes
  
  // Check timestamp freshness
  const timestampMs = parseInt(timestamp) * 1000;
  if (Date.now() - timestampMs > MAX_AGE) {
    throw new Error('Webhook timestamp too old');
  }
  
  // Compute expected signature
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

---

### HIGH-02: Add Bot Fingerprinting

**Location**: Widget embed code  
**Owner**: Frontend  
**Timeline**: 2 days

```typescript
// public/widget/fingerprint.ts
// Using FingerprintJS Pro (recommended) or open-source alternative

import FingerprintJS from '@fingerprintjs/fingerprintjs';

export async function getVisitorFingerprint(): Promise<string> {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
}

// Include in chat requests
const chatRequest = {
  message: userMessage,
  tenant_id: tenantId,
  fingerprint: await getVisitorFingerprint(),
};
```

---

### HIGH-03: Implement CAPTCHA Escalation

**Location**: Widget + API  
**Owner**: Frontend + Backend  
**Timeline**: 2 days

```typescript
// src/lib/security/captcha-escalation.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function shouldRequireCaptcha(
  fingerprint: string,
  ipAddress: string
): Promise<'none' | 'soft' | 'hard'> {
  const key = `abuse:${fingerprint || ipAddress}`;
  const score = parseInt(await redis.get(key) || '0');
  
  if (score >= 10) return 'hard';  // Confirmed abuse
  if (score >= 5) return 'soft';   // Suspicious
  return 'none';
}

export async function recordSuspiciousActivity(
  fingerprint: string,
  ipAddress: string,
  severity: 1 | 2 | 5
): Promise<void> {
  const key = `abuse:${fingerprint || ipAddress}`;
  await redis.incrby(key, severity);
  await redis.expire(key, 24 * 60 * 60); // 24 hour window
}
```

---

### HIGH-04: Set Up Security Monitoring Dashboard

**Location**: Grafana or similar  
**Owner**: DevOps  
**Timeline**: 3 days

**Metrics to display:**
- Rate limit hits per minute by tenant
- Injection detection events
- Auth failures per hour
- GDPR requests (export/delete)
- Cross-tenant access attempts (should be 0)

---

### HIGH-05: Configure Anomaly Detection Alerts

**Location**: Monitoring infrastructure  
**Owner**: DevOps  
**Timeline**: 2 days

```yaml
# alertmanager/security-alerts.yaml
groups:
  - name: security
    rules:
      - alert: HighInjectionAttempts
        expr: rate(injection_detected_total[5m]) > 10
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High injection attempt rate detected"
          
      - alert: CrossTenantAccess
        expr: cross_tenant_violation_total > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "CRITICAL: Cross-tenant access attempt detected"
          
      - alert: RateLimitBurstTenant
        expr: rate_limit_exceeded_total{type="tenant"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Tenant exceeding rate limits significantly"
```

---

## 📊 Implementation Timeline

```
Week 1 (Days 1-5):
├── Day 1: CRIT-06 Secret rotation
├── Day 2: CRIT-02 Security headers
├── Day 3-4: CRIT-01 WAF deployment
└── Day 5: CRIT-03 Per-bot rate limiting

Week 2 (Days 6-10):
├── Day 6-7: CRIT-04 GDPR export endpoint
├── Day 8-9: CRIT-05 GDPR delete endpoint
└── Day 10: HIGH-01 Webhook verification

Week 3 (Days 11-15):
├── Day 11-12: HIGH-02 Bot fingerprinting
├── Day 13-14: HIGH-03 CAPTCHA escalation
└── Day 15: Testing & validation

Week 4 (Days 16-20):
├── Day 16-18: HIGH-04 Security dashboard
├── Day 19-20: HIGH-05 Anomaly alerts
└── Final review & documentation
```

---

## ✅ Verification Checklist

### Pre-Launch Gate

- [ ] All CRIT items implemented
- [ ] Security headers returning correctly
- [ ] WAF blocking test injections
- [ ] Rate limits functioning per-bot
- [ ] GDPR export produces valid JSON
- [ ] GDPR delete removes all user data
- [ ] All production secrets rotated
- [ ] No dev secrets in production

### Post-Launch Monitoring

- [ ] Security dashboard accessible
- [ ] Alerts firing correctly (test with synthetic events)
- [ ] Audit logs being written
- [ ] No cross-tenant violations in first 24h
- [ ] Rate limits preventing abuse

---

## 📁 Files to Create/Modify

| File | Action | Task |
|------|--------|------|
| `next.config.ts` | Modify | CRIT-02 |
| `src/lib/rate-limit/per-bot-limiter.ts` | Create | CRIT-03 |
| `src/app/api/gdpr/export/route.ts` | Create | CRIT-04 |
| `src/app/api/gdpr/delete/route.ts` | Create | CRIT-05 |
| `supabase/migrations/YYYYMMDD_gdpr_functions.sql` | Create | CRIT-05 |
| `src/lib/webhooks/verify-signature.ts` | Create | HIGH-01 |
| `public/widget/fingerprint.ts` | Create | HIGH-02 |
| `src/lib/security/captcha-escalation.ts` | Create | HIGH-03 |

---

**Document Owner**: Backend Lead  
**Review Cycle**: Weekly during implementation  
**Sign-off Required**: CTO, Security Lead
