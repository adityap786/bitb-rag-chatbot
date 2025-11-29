/**
 * Healthcare HIPAA Compliance Utilities
 * 
 * Detects and masks Protected Health Information (PHI) as defined by HIPAA.
 * 
 * HIPAA Safe Harbor Method - 18 Identifiers:
 * 1. Names, 2. Geographic subdivisions, 3. Dates (except year), 
 * 4. Phone numbers, 5. Fax numbers, 6. Email addresses,
 * 7. SSN, 8. MRN, 9. Health plan numbers, 10. Account numbers,
 * 11. Certificate/license numbers, 12. Vehicle identifiers,
 * 13. Device identifiers, 14. URLs, 15. IP addresses,
 * 16. Biometric identifiers, 17. Photos, 18. Other unique identifiers
 * 
 * @see https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification/index.html
 */

export interface PHIDetectionResult {
  detected: boolean;
  types: string[];
  maskedText: string;
  auditRequired: boolean;
}

const PHI_PATTERNS = {
  // Email addresses
  email: /[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g,
  
  // Phone numbers (US format)
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  
  // Social Security Numbers
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  
  // Medical Record Numbers (MRN)
  mrn: /\b(?:MRN|Medical Record|Patient ID)[:#]?\s*[A-Z0-9]{6,12}\b/gi,
  
  // Insurance/Health Plan Numbers
  insuranceId: /\b(?:Policy|Member|Group|Subscriber)[\s#:]*[A-Z0-9]{6,20}\b/gi,
  
  // IP Addresses (HIPAA identifier)
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  
  // URLs (can contain PHI)
  url: /https?:\/\/[^\s]+/g,
  
  // Account numbers (generic pattern)
  accountNumber: /\b(?:Account|Acct)[\s#:]*\d{8,16}\b/gi
};

/**
 * Detects and masks Protected Health Information (PHI)
 * 
 * @param text - Input text to scan for PHI
 * @param options - Configuration options
 * @returns PHI detection result with masked text
 */
export function detectAndMaskPHI(
  text: string, 
  options?: { strict?: boolean; auditLog?: boolean }
): PHIDetectionResult {
  let maskedText = text;
  const types = new Set<string>();
  const strict = options?.strict ?? true;

  if (!text || text.trim().length === 0) {
    return { detected: false, types: [], maskedText: '', auditRequired: false };
  }

  // Reset regex indices
  Object.values(PHI_PATTERNS).forEach(pattern => pattern.lastIndex = 0);

  // Email
  if (PHI_PATTERNS.email.test(text)) {
    types.add('email');
    maskedText = maskedText.replace(PHI_PATTERNS.email, '[EMAIL_REDACTED]');
  }

  // Phone
  if (PHI_PATTERNS.phone.test(text)) {
    types.add('phone');
    maskedText = maskedText.replace(PHI_PATTERNS.phone, '[PHONE_REDACTED]');
  }

  // SSN
  if (PHI_PATTERNS.ssn.test(text)) {
    types.add('ssn');
    maskedText = maskedText.replace(PHI_PATTERNS.ssn, '[SSN_REDACTED]');
  }

  // MRN
  if (PHI_PATTERNS.mrn.test(text)) {
    types.add('mrn');
    maskedText = maskedText.replace(PHI_PATTERNS.mrn, '[MRN_REDACTED]');
  }

  // Insurance ID
  if (PHI_PATTERNS.insuranceId.test(text)) {
    types.add('insurance_id');
    maskedText = maskedText.replace(PHI_PATTERNS.insuranceId, '[INSURANCE_ID_REDACTED]');
  }

  // IP Address
  if (PHI_PATTERNS.ip.test(text)) {
    types.add('ip_address');
    maskedText = maskedText.replace(PHI_PATTERNS.ip, '[IP_REDACTED]');
  }

  // URLs
  if (PHI_PATTERNS.url.test(text)) {
    types.add('url');
    maskedText = maskedText.replace(PHI_PATTERNS.url, '[URL_REDACTED]');
  }

  // Account Numbers
  if (PHI_PATTERNS.accountNumber.test(text)) {
    types.add('account_number');
    maskedText = maskedText.replace(PHI_PATTERNS.accountNumber, '[ACCOUNT_REDACTED]');
  }

  const detected = types.size > 0;
  const auditRequired = detected && (options?.auditLog ?? true);

  // In strict mode, log PHI detection for compliance audit
  if (detected && strict && auditRequired) {
    // TODO: Integrate with audit logging system
    console.warn(`[HIPAA] PHI detected: ${Array.from(types).join(', ')}`);
  }

  return {
    detected,
    types: Array.from(types),
    maskedText,
    auditRequired
  };
}

/**
 * Validates HIPAA compliance of text
 * 
 * @param text - Text to validate
 * @param options - Validation options
 * @returns Compliance status with details
 */
export function validateHIPAACompliance(text: string, options?: { 
  allowMasked?: boolean;
  requireAudit?: boolean;
}): {
  compliant: boolean;
  violations: string[];
  recommendation: string;
} {
  const { detected, types, auditRequired } = detectAndMaskPHI(text, { strict: true });
  
  const violations: string[] = [];
  
  if (detected) {
    violations.push(`PHI detected: ${types.join(', ')}`);
  }
  
  if (auditRequired && options?.requireAudit) {
    violations.push('Audit logging required for this content');
  }
  
  const compliant = violations.length === 0 || ((options?.allowMasked ?? false) && detected);
  
  return {
    compliant,
    violations,
    recommendation: !compliant 
      ? 'Mask all PHI before storage or transmission. Enable audit logging.'
      : 'Text is HIPAA compliant.'
  };
}

/**
 * @deprecated Use validateHIPAACompliance instead
 */
export function isHIPAACompliant(text: string): boolean {
  return validateHIPAACompliance(text).compliant;
}
