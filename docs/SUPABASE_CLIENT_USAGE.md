# Supabase Client Usage Guide

## Overview

The project uses a **centralized lazy Supabase client factory** (`src/lib/supabase-client.ts`) to avoid build-time errors when environment variables are not configured. This allows Next.js builds to succeed in CI/CD environments without requiring production secrets.

## Why Lazy Clients?

Previously, routes created Supabase clients at module import time:

```typescript
// ❌ Old approach - fails at build time if env vars missing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

During Next.js builds, the framework executes server-side code to collect page data. If environment variables are missing, the build fails with:

```
Error: supabaseUrl is required.
```

## Solution: Lazy Client Factory

The new centralized helper (`src/lib/supabase-client.ts`) provides lazy-initialized clients that only construct when **first accessed**, not at import time.

### Usage

#### For API Routes and Server Components

```typescript
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

export async function GET(req: NextRequest) {
  // Client is constructed here on first use
  const { data } = await supabase.from('table').select();
  // ...
}
```

#### For Utility Functions

```typescript
import { getServiceClient } from '@/lib/supabase-client';

export async function someUtility(tenantId: string) {
  const supabase = getServiceClient();
  const { data } = await supabase.from('tenants').select();
  // ...
}
```

## API Reference

### `createLazyServiceClient()`

Returns a Proxy-based lazy client. Best for module-level constants.

```typescript
const supabase = createLazyServiceClient();
```

- **Constructs:** On first property/method access
- **Throws:** At runtime (not import time) if env vars missing
- **Use case:** API routes, server components, module-level constants

### `getServiceClient()`

Returns the singleton service-role client. Best for utilities and one-off calls.

```typescript
const supabase = getServiceClient();
```

- **Constructs:** On first call (cached thereafter)
- **Throws:** At runtime if env vars missing
- **Use case:** Utility functions, one-off queries

### `resetServiceClient()`

Resets the cached client (useful for testing).

```typescript
resetServiceClient();
```

## Environment Variables

The lazy client factory checks for these environment variables (in order):

1. `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`

**Error message if missing:**

```
Supabase service role credentials are not configured. 
Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY environment variables.
```

## Migration Status

All files updated to use the lazy client factory:

### API Routes
- ✅ `src/app/api/trial/start/route.ts`
- ✅ `src/app/api/trial/kb/upload/route.ts`
- ✅ `src/app/api/trial/kb/manual/route.ts`
- ✅ `src/app/api/trial/branding/route.ts`
- ✅ `src/app/api/trial/generate-widget/route.ts`
- ✅ `src/app/api/widget/session/route.ts`
- ✅ `src/app/api/widget/chat/route.ts`
- ✅ `src/app/api/admin/trials/route.ts`
- ✅ `src/app/api/admin/trials/[id]/extend/route.ts`
- ✅ `src/app/api/admin/trials/[id]/upgrade/route.ts`
- ✅ `src/app/api/admin/usage/route.ts`
- ✅ `src/app/api/admin/metrics/aggregate/route.ts`

### Libraries
- ✅ `src/lib/trial/rag-pipeline.ts`
- ✅ `src/lib/trial/usage-tracker.ts`
- ✅ `src/lib/trial/quota-enforcer.ts`
- ✅ `src/lib/trial/audit-logger.ts`

## Build Verification

After migration, the Next.js build succeeds without environment variables:

```bash
npm run build
```

```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages (35/35)
```

## Testing

When writing tests, you can reset the cached client between tests:

```typescript
import { resetServiceClient } from '@/lib/supabase-client';

afterEach(() => {
  resetServiceClient();
});
```

## Best Practices

1. **Always use the lazy helper** - Never create clients with `createClient()` at module level
2. **Check environment in production** - Ensure all required env vars are set before deploying
3. **Use getServiceClient() for utilities** - For better stack traces and simpler code
4. **Use createLazyServiceClient() for routes** - For module-level constants that are imported but may not be used immediately

## Related Files

- **Helper:** `src/lib/supabase-client.ts`
- **Usage:** See any route file under `src/app/api/`
- **Tests:** `tests/trial/workflow.test.ts` (uses mocked clients)
