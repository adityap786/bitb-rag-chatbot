import { getAllowedOrigins } from './tenant-config';

export interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
}

/**
 * Build dynamic CORS headers for a request scoped to a tenant.
 *
 * - If `Origin` header is absent we treat it as a server-to-server call (allowed).
 * - If `Origin` exists, resolve allowed origins for the tenant and return
 *   appropriate `Access-Control-*` headers when matched.
 */
export async function buildCorsHeaders(
  request: Request,
  tenantId?: string,
  opts?: { methods?: string; allowHeaders?: string; credentials?: boolean; maxAge?: string }
): Promise<CorsResult> {
  const origin = request.headers.get('origin');
  if (!origin) {
    // Server-to-server calls (no Origin) are allowed
    return { allowed: true, headers: {} };
  }

  const allowedOrigins = await getAllowedOrigins(tenantId);
  const normalized = allowedOrigins.map(o => o.toLowerCase());

  if (normalized.includes(origin.toLowerCase())) {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    };
    if (opts?.credentials) headers['Access-Control-Allow-Credentials'] = 'true';
    if (opts?.allowHeaders) headers['Access-Control-Allow-Headers'] = opts.allowHeaders;
    if (opts?.methods) headers['Access-Control-Allow-Methods'] = opts.methods;
    if (opts?.maxAge) headers['Access-Control-Max-Age'] = opts.maxAge;
    return { allowed: true, headers };
  }

  return { allowed: false, headers: {} };
}
