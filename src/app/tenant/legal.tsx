// Legal tenant config and UI structure
export interface LegalConfig {
  jurisdiction: string;
  disclaimer: string;
  supportedDocs: string[];
}

export const legalTenantConfig: LegalConfig = {
  jurisdiction: 'US',
  disclaimer: 'This AI assistant does not provide legal advice. For US law, consult a licensed attorney.',
  supportedDocs: ['contract', 'nda', 'will', 'agreement']
};

export function isLegalTenant(tenantConfig: any): boolean {
  return tenantConfig?.business_type === 'legal' || tenantConfig?.industry === 'legal';
}
