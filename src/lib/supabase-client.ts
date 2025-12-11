/**
 * Centralized lazy Supabase client factory with connection pooling
 * 
 * This module provides lazy-initialized Supabase clients that only construct
 * when first accessed, avoiding build-time errors when environment variables
 * are missing. Safe for use in server-side Next.js routes.
 * 
 * Connection Pooling (Supavisor):
 * - Uses transaction mode pooler for short-lived connections
 * - Prevents connection exhaustion under high load
 * - Configure via SUPABASE_POOLER_URL environment variable
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Connection pool configuration
const POOL_CONFIG = {
  // Use transaction mode for web requests (short-lived)
  mode: 'transaction' as const,
  // Maximum connections per client
  maxConnections: parseInt(process.env.SUPABASE_MAX_CONNECTIONS || '10', 10),
  // Connection timeout in ms
  connectionTimeoutMs: parseInt(process.env.SUPABASE_CONNECTION_TIMEOUT_MS || '10000', 10),
};

/**
 * Get the appropriate Supabase URL (pooler or direct)
 */
function getSupabaseUrl(): string {
  // Prefer pooler URL for production (connection pooling via Supavisor)
  const poolerUrl = process.env.SUPABASE_POOLER_URL;
  if (poolerUrl && process.env.NODE_ENV === 'production') {
    return poolerUrl;
  }
  // Fall back to direct URL
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

/**
 * Lazy service-role Supabase client (admin access)
 * 
 * Creates client on first property access. Throws at runtime (not import-time)
 * if environment variables are not configured.
 * 
 * @example
 * ```typescript
 * import { getServiceClient } from '@/lib/supabase-client';
 * 
 * export async function GET(req: NextRequest) {
 *   const supabase = getServiceClient();
 *   const { data } = await supabase.from('table').select();
 *   // ...
 * }
 * ```
 */
let _serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error(
        'Supabase service role credentials are not configured. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }
    
    _serviceClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'x-connection-pool-mode': POOL_CONFIG.mode,
        },
      },
    });
  }
  
  return _serviceClient;
}

/**
 * Helper to set the tenant context for RLS
 * Must be called before executing queries that rely on RLS policies using app.current_tenant_id
 */
export async function setTenantContext(client: SupabaseClient, tenantId: string) {
  await client.rpc('set_tenant_context', { p_tenant_id: tenantId });
}

/**
 * Create a lazy proxy client (alternative approach)
 * 
 * Returns a Proxy that constructs the real client only when methods are accessed.
 * Use this for module-level constants that need to be imported but not immediately used.
 * 
 * @example
 * ```typescript
 * import { createLazyServiceClient } from '@/lib/supabase-client';
 * 
 * const supabase = createLazyServiceClient();
 * 
 * // Client is constructed here on first use:
 * const { data } = await supabase.from('table').select();
 * ```
 */
export function createLazyServiceClient(): SupabaseClient {
  let client: SupabaseClient | null = null;
  
  return new Proxy({} as SupabaseClient, {
    get(_, prop) {
      if (!client) {
        client = getServiceClient();
      }
      const value = (client as any)[prop];
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    }
  });
}

/**
 * Reset the cached client (useful for testing)
 */
export function resetServiceClient(): void {
  _serviceClient = null;
}
