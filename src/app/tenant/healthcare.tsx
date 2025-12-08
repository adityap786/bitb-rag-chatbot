// Healthcare tenant config and UI structure
// This file defines healthcare-specific tenant settings and UI scaffolding

export interface HealthcareConfig {
  hipaaEnabled: boolean;
  appointmentBooking: boolean;
  privacyControls: string[];
  medicalPrompts: string[];
  disclaimer: string;
}

export const healthcareTenantConfig: HealthcareConfig = {
  hipaaEnabled: true,
  appointmentBooking: true,
  privacyControls: ['mask_PHI', 'audit_log'],
  medicalPrompts: [
    'What symptoms are you experiencing?',
    'Do you have any allergies?',
    'What medications are you currently taking?'
  ],
  disclaimer: 'This AI assistant provides information for educational purposes only and does not constitute medical advice. In case of emergency, call 911.'
};

// Helper to check if a tenant is healthcare-based (mock implementation)
export function isHealthcareTenant(tenantConfig: any): boolean {
  return tenantConfig?.business_type === 'healthcare' || tenantConfig?.industry === 'healthcare';
}

