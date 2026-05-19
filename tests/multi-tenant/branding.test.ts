import { describe, it, expect } from 'vitest';
import { getTenantBranding, setTenantBranding } from '../../src/lib/branding/tenantBranding';

describe('Tenant Branding', () => {
  it('should set and get branding for a tenant', async () => {
    await setTenantBranding('test-tenant-1', { logo: 'logo.png', color: '#123456' });
    const branding = await getTenantBranding('test-tenant-1');
    expect(branding.logo).toBe('logo.png');
    expect(branding.color).toBe('#123456');
  });
});
