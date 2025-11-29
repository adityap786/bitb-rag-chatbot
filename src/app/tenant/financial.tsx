// Financial tenant config and UI structure
export interface FinancialConfig {
  disclaimer: string;
  transactionLimit: number;
}

export const financialTenantConfig: FinancialConfig = {
  disclaimer: 'This AI assistant does not provide financial advice. For investment or banking decisions, consult a licensed financial advisor.',
  transactionLimit: 10000
};

export function isFinancialTenant(tenantConfig: any): boolean {
  return tenantConfig?.business_type === 'financial' || tenantConfig?.industry === 'financial';
}
