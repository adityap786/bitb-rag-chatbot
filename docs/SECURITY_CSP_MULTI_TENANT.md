# Security, CSP & Multi-Tenant Considerations

This document provides production-ready guidance for securely embedding and running the `bitb-widget` across tenant sites. It covers identity and token flows, CSP/CORS recommendations, iframe isolation, server-side validation, consent & privacy considerations, and operational controls.

> Goal: let tenants embed a lightweight, secure widget without exposing secrets, while maintaining strict tenant isolation and minimal attack surface.

---

## Threat Model (high level)
- Adversary with access to a tenant page tries to exfiltrate tenant data or impersonate another tenant.
- Cross-site scripting (XSS) in tenant page that attempts to execute malicious code via the widget.
- Attacker attempts to call widget-protected APIs directly (replay, brute-force, or from unauthorized origins).

Design goals: least privilege, short-lived credentials for client flows, server-side verification for protected operations, and clear CSP/CORS guidance for tenants.

---

## Key Principles
- Never place long-lived secrets in browser-embedded code.
- Use short-lived, audience-restricted JWTs for client-to-backend auth (5–15 minutes recommended).
- Validate origin and tenant mapping server-side for all API calls.
- Serve the loader as a versioned artifact on a CDN (e.g., `/v1/bitb-widget.js`) so tenants can pin versions.
- Prefer iframe isolation for complex UI surfaces; if using an iframe, sandbox it.
- Provide both a no-inline-init option (data-attributes) and a nonce-based init option for CSP-friendly installs.

---

## Recommended Token Minting Flow (production-ready)
1. Tenant operator configures a server-side API key in their tenant admin (kept secret in their server environment/secret manager).
2. Tenant's server exposes a lightweight endpoint (e.g., `GET /.well-known/bitb-token` or `/api/bitb/token`) that authenticates the visiting user/session and calls BITB's server endpoint (`POST https://api.bitb.example.com/api/mint-token`) using the tenant API key to request a short-lived JWT.
3. BITB validates the tenant API key, issues a JWT scoped to the tenant (audience `bitb-widget`, issuer `https://api.bitb.example.com`), and returns token + expiry.
4. The tenant server returns the short-lived token to the browser (or directly injects a `data-token` attribute into server-rendered HTML). The client script uses the token for websocket or API calls to BITB.

Why this pattern:
- Tenant API keys never touch the browser.
- Tokens are short-lived and scoped to specific tenant + audience; revocation and rotation are simpler.

### Sample server-to-server call (Node.js)
```js
// Tenant server: request short-lived token from BITB
const fetch = require('node-fetch');

async function getBitbTokenForTenant(tenantId) {
  const resp = await fetch('https://api.bitb.example.com/api/mint-token', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.BITB_TENANT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId })
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json(); // { token, expiresAt }
}
```

### Client (embedding) - safe initialization (no inline JS needed)
Embed a versioned loader that auto-inits via data attributes so tenant pages don't have to use inline scripts:
```html
<script
  src="https://cdn.bitb.example.com/v1/bitb-widget.js"
  data-tenant-id="tenant_abc"
  data-token="<SHORT_LIVED_TOKEN>"
  async
></script>
```
The loader will read `data-token` and authenticate the client requests.

If tenants can't inject a `data-token`, the loader will call a tenant-hosted endpoint (e.g., `/.well-known/bitb-token`) to fetch the token. This keeps secrets server-side.

---

## JWT Shape & Verification (recommendation)
- Claims to include:
  - `iss`: `https://api.bitb.example.com`
  - `sub`: `tenant:{tenantId}` or just tenant id string
  - `aud`: `bitb-widget`
  - `iat` and `exp` (short TTL—5–15 minutes)
  - `jti`: unique id for the token (optional, helpful for revocation)

### Example payload
```json
{
  "iss": "https://api.bitb.example.com",
  "aud": "bitb-widget",
  "sub": "tenant:tenant_abc",
  "iat": 169xxx,
  "exp": 169xxx,
  "jti": "uuid-v4"
}
```

### Verify token (Node.js + `jose`)
```js
import { jwtVerify } from 'jose';

const BITB_ISSUER = 'https://api.bitb.example.com';
const BITB_AUDIENCE = 'bitb-widget';

async function verifyBitbJwt(token, publicKey) {
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: BITB_ISSUER,
    audience: BITB_AUDIENCE,
  });
  return payload; // contains tenant id in `sub`
}
```

---

## CORS & API Hardening
- Never use `Access-Control-Allow-Origin: *` for APIs that accept credentials or tenant-specific data.
- Maintain an `allowedOrigins` list per tenant in your database. On each API request:
  - Read the `Origin` header.
  - Verify it matches an allowed origin for the token's tenant.
  - If matched, set `Access-Control-Allow-Origin` to that origin and `Access-Control-Allow-Credentials: true` if cookies used.

### Dynamic CORS (Express example)
```js
app.use(async (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  const tenant = await tenantForRequest(req); // resolve tenant by token, host, etc.
  const allowed = await getAllowedDomainsForTenant(tenant.id);
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  next();
});
```

---

## Content Security Policy (CSP) — Tenant Guidance
Provide tenants with two recommended approaches depending on their ability to control CSP headers.

1) Minimal change (easy, less strict)
```http
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.bitb.example.com; connect-src 'self' https://api.bitb.example.com; img-src 'self' data: https://cdn.bitb.example.com; frame-src https://widget.bitb.example.com; style-src 'self' 'unsafe-inline' https://cdn.bitb.example.com;
```
2) Strict (nonce-based, recommended when tenant can add nonces)
- Server generates a per-response nonce and adds it to `script-src`.
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<SERVER_NONCE>' https://cdn.bitb.example.com; connect-src 'self' https://api.bitb.example.com; frame-src https://widget.bitb.example.com;
```
- Then render init script with same nonce instead of using `unsafe-inline`.

Notes:
- If the tenant cannot add a nonce or modify CSP (some hosted builders), prefer the `data-token` pattern so the page has no inline script.
- Encourage tenants to pin the exact CDN version (`/v1/bitb-widget.js`) instead of `latest` to benefit from SRI.

### Subresource Integrity (SRI)
If you publish a stable, versioned bundle, publish the SRI hash and recommend tenants use it:
```html
<script src="https://cdn.bitb.example.com/v1/bitb-widget.js" integrity="sha384-..." crossorigin="anonymous"></script>
```
SRI is incompatible with scripts that change frequently; prefer for tagged releases.

---

## Embedding & iframe isolation
Prefer an iframe for the widget UI when the widget needs isolation from the host page's CSS or JS.

Recommended iframe pattern (sandboxed):
```html
<iframe
  src="https://widget.bitb.example.com/?tid=tenant_abc"
  sandbox="allow-scripts allow-forms allow-popups"
  referrerpolicy="no-referrer"
  loading="lazy"
  style="border:0;width:380px;height:600px"
></iframe>
```
- Avoid `allow-same-origin` unless absolutely required (it reduces origin isolation).
- If `allow-same-origin` is required for cookies/localStorage interactions, ensure the iframe content is hardened and limited in privileges.
- Use `postMessage` for parent↔iframe communication and always verify `event.origin` and message shape.

### postMessage security
```js
// In parent
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://widget.bitb.example.com') return;
  // validate e.data structure
});

// In iframe
parent.postMessage({ type: 'bitb-ready' }, 'https://tenant-site.example');
```

---

## Server-side Validation & Data Isolation
- Enforce `tenant_id` on every DB query (use RLS / row-level security where available).
- Parameterize all DB queries; never interpolate tenant identifiers into SQL strings.
- Store `allowedOrigins[]` per tenant and always validate `Origin` header for API calls that affect or retrieve tenant-scoped data.
- For operations modifying tenant settings, require server-to-server authentication (tenant API key) + owner/administrator session checks.

---

## Consent, Privacy & Data Retention
- Provide explicit options for tenants to opt into transcript retention or analytics.
- Default to minimal retention (e.g., 7–30 days) and allow tenant-level configuration.
- Pseudonymize or redact PII from stored transcripts. Provide export/delete tools for compliance (GDPR/CCPA).
- Document what data is sent to third-party LLMs and provide an opt-out for tenants that cannot share PII externally.

---

## Operational Security & Secrets
- Keep tenant API keys & platform secrets in secret managers (AWS Secrets Manager, Azure Key Vault, Vercel environment variables).
- Rotate tenant API keys regularly; provide a UI for rotation without downtime (maintain previous key for a short overlap period).
- Log authentication failures and suspicious mint-token activity per tenant; alert on spikes.
- Implement per-tenant rate limiting and global rate limiting in front of the API (e.g., API Gateway, Cloudflare, or Nginx + lua limit_req).

---

## Monitoring & Incident Response
- Expose metrics per tenant: token mint failures, API error rates, rate-limit events, anomalous origin usage.
- Maintain an incident runbook: how to revoke keys (mark key as disabled in DB), how to roll back CDN to previous widget version, how to force-rotate tokens.

---

## Quick Nginx Example (CSP + CORS header injection)
```nginx
location / {
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://cdn.bitb.example.com; connect-src 'self' https://api.bitb.example.com; frame-src https://widget.bitb.example.com;";
  # Dynamic CORS is best handled at the app layer; static example below (not for multi-tenant):
  add_header Access-Control-Allow-Origin "https://example-tenant.com";
}
```

---

## Quick Checklist
- [ ] Serve loader from versioned CDN and publish SRI for releases.
- [ ] Implement tenant server endpoint to fetch short-lived tokens (server-to-server key exchange).
- [ ] Enforce dynamic CORS checks based on `allowedOrigins` per tenant.
- [ ] Provide `data-token` loader pattern so tenants avoid inline scripts.
- [ ] Use iframe + sandbox where feasible; otherwise use strict CSP with nonces.
- [ ] Implement per-tenant rate limits and monitoring.
- [ ] Publish privacy & retention settings; provide export/delete tools.

---

## Files created
- `docs/SECURITY_CSP_MULTI_TENANT.md` (this file)

---

If you'd like, I can now:
- add a small tenant-server example repo (`examples/tenant-server`) that implements the secure token endpoint and SSR injection, or
- implement runtime middleware in our API for dynamic CORS and origin verification.

Which would you prefer next?