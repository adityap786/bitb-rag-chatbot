// Real estate tenant config and UI scaffolding
export interface RealEstateConfig {
  currency: string;
  listingSources: string[];
  allowScheduling: boolean;
  disclaimer: string;
}

export const realEstateTenantConfig: RealEstateConfig = {
  currency: 'USD',
  listingSources: ['mock', 'mls', 'zillow'],
  allowScheduling: true,
  disclaimer: 'Listings are for informational purposes only. Confirm details with the listing agent.'
};

export function isRealEstateTenant(tenantConfig: any): boolean {
  return tenantConfig?.business_type === 'real_estate' || tenantConfig?.industry === 'real_estate' || tenantConfig?.industry === 'realestate';
}
