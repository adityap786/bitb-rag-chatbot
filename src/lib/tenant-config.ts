// import { redis } from './redis-client';
// ...existing code...
// import { createClient } from '@supabase/supabase-js';
import { redis } from './redis-client';
// ...existing code...
import { createClient } from '@supabase/supabase-js';

// Singleton Supabase client pool
let supabaseSingleton: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  if (!supabaseSingleton) {
    supabaseSingleton = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseSingleton;
}

/**
 * Resolve allowed origins for a tenant.
 *
 * Priority:
 * 1. Supabase `tenant_config.allowed_origins` (array or comma-separated string)
 * 2. Global env `TENANT_ALLOWED_ORIGINS` (comma-separated)
 * 3. Empty array
 */
const CACHE_TTL = 60 * 60; // 1 hour

const memoryCache: Record<string, { value: any; expires: number }> = {};

export async function getAllowedOrigins(tenantId?: string): Promise<string[]> {
  // Try Supabase-backed tenant_config if available and tenantId provided
  let origins: string[] = [];
  const supabase = getSupabaseClient();
  if (supabase && tenantId) {
    try {
      const { data, error } = await supabase
        .from('tenant_config')
        .select('allowed_origins')
        .eq('tenant_id', tenantId)
        .single();

      // Supabase client typings can be strict/unknown in some setups.
      // Cast to `any` for runtime-safe access to the `allowed_origins` field
      // and avoid TypeScript inferring `never` for the returned row.
      const row: any = data ?? null;
      if (!error && row && row.allowed_origins) {
        if (Array.isArray(row.allowed_origins)) {
          origins = row.allowed_origins.map((v: any) => String(v).trim()).filter(Boolean);
        } else if (typeof row.allowed_origins === 'string') {
          origins = row.allowed_origins.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }
    } catch (err) {
      // Don't throw - fallback to env-based config
      // Log for debugging in production
      // eslint-disable-next-line no-console
      console.error('[tenant-config] supabase lookup failed', err);
    }
  }

  // Fallback to global env var if not found
  if (origins.length === 0) {
    const global = process.env.TENANT_ALLOWED_ORIGINS;
    if (global) {
      origins = global.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // Store in cache (cacheKey scoped to tenant)
  const cacheKey = `tenant_allowed_origins:${tenantId ?? 'global'}`;
  if (redis && typeof redis.set === 'function') {
    try {
      await redis.set(cacheKey, JSON.stringify(origins), { ex: CACHE_TTL });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tenant-config] Redis cache set error', err);
    }
  } else {
    memoryCache[cacheKey] = { value: origins, expires: Date.now() + CACHE_TTL * 1000 };
  }

  return origins;
}
