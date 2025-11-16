/**
 * PII Masking Utility
 * 
 * Detects and masks Personally Identifiable Information (PII) in text
 * before sending to LLM providers. Ensures compliance and privacy.
 * 
 * Supported PII types:
 * - Email addresses
 * - Phone numbers (US/International)
 * - Credit card numbers
 * - Social Security Numbers (SSN)
 * - IP addresses
 * - URLs with credentials
 * - API keys / tokens
 */

/**
 * PII pattern definitions
 */
const PII_PATTERNS = {
  // Email: user@domain.com
  email: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
  },

  // Phone: (555) 123-4567, 555-123-4567, +1-555-123-4567
  phone: {
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },

  // Credit Card: 4111-1111-1111-1111, 4111 1111 1111 1111
  creditCard: {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[CARD_REDACTED]',
  },

  // SSN: 123-45-6789
  ssn: {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },

  // IPv4: 192.168.1.1
  ipv4: {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_REDACTED]',
  },

  // IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
  ipv6: {
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    replacement: '[IP_REDACTED]',
  },

  // URLs with credentials: https://user:pass@example.com
  urlWithCreds: {
    pattern: /https?:\/\/[^:]+:[^@]+@[^\s]+/g,
    replacement: '[URL_WITH_CREDS_REDACTED]',
  },

  // API Keys: sk_live_abc123..., pk_test_xyz789...
  apiKey: {
    pattern: /\b(sk|pk)_(live|test)_[a-zA-Z0-9]{20,}\b/g,
    replacement: '[API_KEY_REDACTED]',
  },

  // Bearer tokens: Bearer abc123...
  bearerToken: {
    pattern: /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: '[BEARER_TOKEN_REDACTED]',
  },

  // AWS Access Keys: AKIA...
  awsAccessKey: {
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    replacement: '[AWS_KEY_REDACTED]',
  },
};

/**
 * PII detection result
 */
export interface PIIDetection {
  type: keyof typeof PII_PATTERNS;
  match: string;
  position: number;
}

/**
 * Masking result
 */
export interface MaskingResult {
  masked_text: string;
  detections: PIIDetection[];
  was_modified: boolean;
}

/**
 * Mask PII in text
 * 
 * @param text - Input text that may contain PII
 * @param options - Masking options
 * @returns Masked text with detection metadata
 */
export function maskPII(
  text: string,
  options?: {
    patterns?: (keyof typeof PII_PATTERNS)[];
    preserveFormat?: boolean; // Keep same character count (replace with *)
  }
): MaskingResult {
  let masked_text = text;
  const detections: PIIDetection[] = [];

  // Determine which patterns to use
  const patternsToCheck = options?.patterns || Object.keys(PII_PATTERNS) as (keyof typeof PII_PATTERNS)[];

  // Apply each pattern
  for (const patternName of patternsToCheck) {
    const { pattern, replacement } = PII_PATTERNS[patternName];
    
    // Find all matches
    const matches = [...text.matchAll(pattern)];
    
    for (const match of matches) {
      detections.push({
        type: patternName,
        match: match[0],
        position: match.index || 0,
      });
    }

    // Replace matches
    if (options?.preserveFormat) {
      // Replace with same number of * characters
      masked_text = masked_text.replace(pattern, (match) => '*'.repeat(match.length));
    } else {
      // Replace with labeled placeholder
      masked_text = masked_text.replace(pattern, replacement);
    }
  }

  return {
    masked_text,
    detections,
    was_modified: detections.length > 0,
  };
}

/**
 * Check if text contains PII (without masking)
 */
export function containsPII(
  text: string,
  options?: {
    patterns?: (keyof typeof PII_PATTERNS)[];
  }
): boolean {
  const patternsToCheck = options?.patterns || Object.keys(PII_PATTERNS) as (keyof typeof PII_PATTERNS)[];

  for (const patternName of patternsToCheck) {
    const { pattern } = PII_PATTERNS[patternName];
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Get PII detections without masking
 */
export function detectPII(
  text: string,
  options?: {
    patterns?: (keyof typeof PII_PATTERNS)[];
  }
): PIIDetection[] {
  const detections: PIIDetection[] = [];
  const patternsToCheck = options?.patterns || Object.keys(PII_PATTERNS) as (keyof typeof PII_PATTERNS)[];

  for (const patternName of patternsToCheck) {
    const { pattern } = PII_PATTERNS[patternName];
    const matches = [...text.matchAll(pattern)];
    
    for (const match of matches) {
      detections.push({
        type: patternName,
        match: match[0],
        position: match.index || 0,
      });
    }
  }

  return detections;
}

/**
 * Mask PII for specific use cases
 */
export const PIIMasker = {
  /**
   * Mask PII before sending to LLM
   */
  forLLM(text: string): MaskingResult {
    return maskPII(text, {
      patterns: ['email', 'phone', 'creditCard', 'ssn', 'apiKey', 'bearerToken', 'awsAccessKey', 'urlWithCreds'],
    });
  },

  /**
   * Mask PII for logging
   */
  forLogs(text: string): MaskingResult {
    return maskPII(text, {
      preserveFormat: true, // Use *** instead of labels
    });
  },

  /**
   * Mask only sensitive credentials
   */
  forCredentials(text: string): MaskingResult {
    return maskPII(text, {
      patterns: ['apiKey', 'bearerToken', 'awsAccessKey', 'urlWithCreds'],
    });
  },

  /**
   * Mask personal identifiers only
   */
  forPersonalData(text: string): MaskingResult {
    return maskPII(text, {
      patterns: ['email', 'phone', 'ssn', 'creditCard'],
    });
  },
};

/**
 * Example usage:
 * 
 * const userQuery = "My email is john@example.com and my SSN is 123-45-6789";
 * const result = PIIMasker.forLLM(userQuery);
 * 
 * console.log(result.masked_text);
 * // => "My email is [EMAIL_REDACTED] and my SSN is [SSN_REDACTED]"
 * 
 * console.log(result.detections);
 * // => [
 * //   { type: 'email', match: 'john@example.com', position: 12 },
 * //   { type: 'ssn', match: '123-45-6789', position: 45 }
 * // ]
 */
