# Per-Tenant Rate Limiting Middleware

## Overview
This middleware enforces rate limits per tenant using open source Redis. All API requests are checked against a configurable window and max count, with keys prefixed by tenant ID for strict isolation.

## Usage
```ts
import { rateLimit } from '../middleware/rate-limit';

export default rateLimit({ window: 60, max: 100 });
```

## Key Decisions
- **Redis** is used for fast, open source, distributed rate limiting.
- All keys are prefixed by tenant ID for strict multi-tenant isolation.
- Middleware is stateless and can be horizontally scaled.
- All rate limit events are logged for audit and abuse prevention.

---

This ensures fair resource usage and protects the system from abuse in a scalable, production-grade way.
