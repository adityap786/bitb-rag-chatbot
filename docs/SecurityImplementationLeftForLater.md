# Security Implementation - Pending Tasks

**Last Updated**: 2025-12-23  
**Status**: Code complete, infrastructure pending

---

## ✅ Completed (Code Implementation)

All code-level security controls have been implemented:

| Task | File(s) Created |
|------|-----------------|
| Security Headers | `next.config.ts`, `middleware.ts` |
| Edge IP Rate Limiting | `middleware.ts` (100 req/min/IP) |
| Per-Bot Rate Limiting | `src/lib/rate-limit/per-bot-limiter.ts` |
| Per-IP Compound Limits | `src/middleware/rate-limit.ts` |
| LLM Provider Rate Limiting | `src/lib/rate-limit/llm-rate-limiter.ts` |
| GDPR Export | `src/app/api/gdpr/export/route.ts` |
| GDPR Delete | `src/app/api/gdpr/delete/route.ts` |
| Webhook Signature Verification | `src/lib/security/webhook-security.ts` |
| Bot Fingerprinting | `src/lib/security/bot-protection.ts` |
| CAPTCHA Escalation | `src/lib/security/bot-protection.ts` |
| RBAC Permissions | `src/lib/security/permissions.ts` |
| Enhanced RBAC Middleware | `src/middleware/rbac.ts` |
| File Upload Security (XPIA) | `src/lib/security/file-validator.ts` |
| JWT Hardening (JTI, IP binding) | `src/lib/auth/admin-auth.ts` |
| DB Function search_path Fix | `supabase/migrations/20251222_fix_function_search_path.sql` |

---

## ⚠️ Pending (Infrastructure/DevOps)

### 1. WAF with OWASP CRS Rules
**Priority**: 🔴 Critical  
**Owner**: Infrastructure  
**Effort**: 2-3 days

```
Options:
- Cloudflare Pro ($20/mo) ← Recommended
- AWS WAF + Shield
- Vercel Enterprise

Rules to configure:
- SQL Injection blocking
- XSS attempt blocking
- Rate limiting at edge layer
- Custom rules for chatbot endpoints
```

---

### 2. Rotate Production Secrets
**Priority**: 🔴 Critical  
**Owner**: DevOps  
**Effort**: 1 day

```bash
# Secrets to rotate before production:
openssl rand -base64 32  # JWT_SECRET
openssl rand -hex 32     # WEBHOOK_SECRET

# Update in Vercel:
vercel env add JWT_SECRET production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add REDIS_PASSWORD production
```

| Secret | Action |
|--------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Regenerate in Supabase dashboard |
| `GROQ_API_KEY` | Create new key in Groq console |
| `REDIS_PASSWORD` | Update in Redis + Vercel |
| `JWT_SECRET` | Generate new, update env |

---

### 3. Security Monitoring Dashboard
**Priority**: 🟠 High  
**Owner**: DevOps  
**Effort**: 3 days

**Metrics to display in Grafana:**
- Rate limit hits per minute by tenant
- Injection detection events
- Auth failures per hour
- GDPR requests (export/delete)
- Cross-tenant access attempts (should be 0)

---

### 4. Anomaly Detection Alerts
**Priority**: 🟠 High  
**Owner**: DevOps  
**Effort**: 2 days

**AlertManager rules to configure:**
```yaml
alerts:
  - HighInjectionAttempts: >10 in 5min → Critical
  - CrossTenantAccess: any → Critical (immediate)
  - RateLimitBurst: >1000 in 5min → Warning
  - AuthFailureSpike: >50 in 1min → Warning
```

**Integration options:**
- PagerDuty
- Slack webhook
- Email

---

## Timeline Recommendation

```
Pre-Production (Required):
├── Day 1: Secret rotation (CRIT-06)
├── Day 2-3: WAF deployment (CRIT-01)
└── Day 4: Smoke testing

Post-Launch (30 days):
├── Week 1-2: Grafana dashboard
└── Week 2-3: Alert configuration
```

---

## Verification Checklist

### Pre-Launch Gate
- [ ] WAF blocking test injections
- [ ] All production secrets rotated
- [ ] No dev secrets in production env

### Post-Launch
- [ ] Security dashboard accessible
- [ ] Alerts firing correctly (test with synthetic events)
- [ ] No cross-tenant violations in first 24h
