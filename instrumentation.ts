/**
 * Next.js Instrumentation
 * 
 * This file runs once when the Next.js server starts.
 * Use it to initialize services that need to run before handling requests.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { initializeRedisRateLimiter } from './src/lib/security/redis-rate-limiter';
import { createClient } from '@supabase/supabase-js';

/**
 * Register function - runs once on server startup
 */
export async function register() {
  // Only run on server (not in edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server services...');

    try {
      // Initialize Redis rate limiter if configured
      const hasRedis = process.env.REDIS_URL || 
                      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
      
      if (hasRedis) {
        console.log('[Instrumentation] Initializing Redis rate limiter...');
        await initializeRedisRateLimiter();
        console.log('[Instrumentation] Redis rate limiter initialized successfully');
      } else {
        console.log('[Instrumentation] Skipping Redis initialization (Redis not configured)');
        console.log('[Instrumentation] Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN or REDIS_URL to enable');
      }

      // Verify demo tenant configuration if present
      await verifyDemoTenantHealth();

      // Add other initialization here (e.g., database connections, cache warmup)

      console.log('[Instrumentation] Server services initialized successfully');
    } catch (error) {
      console.error('[Instrumentation] Failed to initialize services:', error);
      // Don't throw - let the app start even if initialization fails
      // Services should handle their own fallbacks
    }
  }
}

async function verifyDemoTenantHealth() {
  const demoTenantId = process.env.DEMO_TENANT_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!demoTenantId) {
    console.log('[Instrumentation] DEMO_TENANT_ID not set; skipping tenant health check');
    return;
  }

  if (!/^tn_[a-f0-9]{32}$/.test(demoTenantId)) {
    console.warn('[Instrumentation] DEMO_TENANT_ID format invalid; expected tn_[a-f0-9]{32}', { demoTenantIdPreview: demoTenantId.slice(0, 10) });
    return;
  }

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Instrumentation] Supabase creds missing; cannot verify DEMO_TENANT_ID');
    return;
  }

  try {
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client
      .from('tenants')
      .select('tenant_id,status,expires_at')
      .eq('tenant_id', demoTenantId)
      .single();

    if (error || !data) {
      console.warn('[Instrumentation] DEMO_TENANT_ID not found in tenants; run scripts/seed-demo-tenant.ts', { demoTenantIdPreview: demoTenantId.slice(0, 10) });
      return;
    }

    const expires = data.expires_at ? new Date(data.expires_at) : null;
    const expired = expires ? expires < new Date() : false;
    const active = data.status === 'active' || data.status === 'trial';

    if (!active) {
      console.warn('[Instrumentation] DEMO_TENANT_ID is not active', { status: data.status, demoTenantIdPreview: demoTenantId.slice(0, 10) });
      return;
    }

    if (expired) {
      console.warn('[Instrumentation] DEMO_TENANT_ID trial expired', { demoTenantIdPreview: demoTenantId.slice(0, 10) });
      return;
    }

    console.log('[Instrumentation] DEMO_TENANT_ID verified and active');
  } catch (err) {
    console.warn('[Instrumentation] DEMO_TENANT_ID health check failed', { error: (err as Error).message });
  }
}
