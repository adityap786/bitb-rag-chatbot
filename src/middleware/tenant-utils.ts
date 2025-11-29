// Utility functions for tenant extraction and validation
import { NextRequest } from 'next/server';

export function extractTenantId(req: NextRequest | { headers: any; body?: any; query?: any }): string | undefined {
  // Try common locations for tenant_id
  if ('headers' in req && req.headers) {
    if (typeof req.headers.get === 'function') {
      // NextRequest
      const headerTenant = req.headers.get('x-tenant-id');
      if (headerTenant) return headerTenant;
    } else if (req.headers['x-tenant-id']) {
      // Express/Node
      return req.headers['x-tenant-id'];
    }
  }
  if ('body' in req && req.body && req.body.tenant_id) return req.body.tenant_id;
  if ('query' in req && req.query && req.query.tenant_id) return req.query.tenant_id;
  return undefined;
}

export function requireTenantId(req: NextRequest | { headers: any; body?: any; query?: any }): string {
  const tenantId = extractTenantId(req);
  if (!tenantId) {
    throw new Error('Missing tenant_id');
  }
  return tenantId;
}
