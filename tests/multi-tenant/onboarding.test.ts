import { describe, it, expect } from 'vitest';
import { createTenant } from '../../src/lib/tenants/onboarding';

describe('Tenant Onboarding', () => {
  it('should create a new tenant with branding and features', async () => {
    const tenant = await createTenant({ name: 'TenantX', branding: { logo: 'x.png' }, features: { chat: true } });
    expect(tenant).toHaveProperty('id');
    expect(tenant.name).toBe('TenantX');
    expect(tenant.branding.logo).toBe('x.png');
    expect(tenant.features.chat).toBe(true);
  });
});
