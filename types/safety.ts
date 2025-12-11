/**
 * Safety & Security Types
 */

export interface SafetyResult {
  safe: boolean;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  checks: Record<string, any>;
  timestamp: string;
}

export interface InputCheckResult {
  safe: boolean;
  checks: {
    prompt_injection: {
      detected: boolean;
      risk_level: 'low' | 'medium' | 'high' | 'critical';
      patterns: string[];
      details: string;
    };
  };
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  duration_ms: number;
  timestamp: number;
}

export interface ContextCheckResult {
  valid: boolean;
  issues: string[];
  timestamp: number;
}

export interface PIIMaskingResult {
  masked_text: string;
  pii_found: Array<{
    type: string;
    original: string;
    masked: string;
    position: number;
  }>;
}
