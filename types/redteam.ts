/**
 * Red-Team & Safety Types
 */

/**
 * Test vector definition
 */
export interface TestVector {
  id: string;
  name: string;
  category: 'jailbreak' | 'instruction_override' | 'prompt_injection' | 'xpia' | 'synonym_attack' | 'xpia_multi_turn';
  attack: string;
  expected_behavior: string;
  assertion?: Record<string, any>;
  impact_level: 'low' | 'medium' | 'high' | 'critical';
  turns?: TestTurn[];
  setup?: {
    ingest?: string | string[];
  };
}

export interface TestTurn {
  number: number;
  user: string;
  expected_response?: string;
}

/**
 * Test execution result
 */
export interface TestResult {
  test_id: string;
  test_name: string;
  category: string;
  status: 'passed' | 'failed' | 'error' | 'skipped';
  passed: boolean;
  checks: Record<string, any>;
  assertions: AssertionResult[];
  duration_ms: number;
  timestamp: string;
}

/**
 * Individual assertion result
 */
export interface AssertionResult {
  name: string;
  passed: boolean;
  details: string;
  severity: 'warning' | 'error' | 'critical';
}

/**
 * Input safety check result
 */
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

/**
 * Context validation result
 */
export interface ContextCheckResult {
  valid: boolean;
  issues: string[];
  timestamp: number;
}

/**
 * Safety result summary
 */
export interface SafetyResult {
  safe: boolean;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  checks: Record<string, any>;
  recommendations: string[];
  timestamp: string;
}

/**
 * Test suite metadata
 */
export interface TestSuiteMetadata {
  version: string;
  description: string;
  categories: string[];
  created: string;
  maintainers: string[];
}

/**
 * Red-team report
 */
export interface RedTeamReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    pass_rate: number;
    duration_ms: number;
    timestamp: string;
  };
  results: TestResult[];
  by_category: Record<string, TestResult[]>;
  recommendations: string[];
  gating_decision: 'approved' | 'rejected' | 'review_required';
}

/**
 * Safety filter configuration
 */
export interface SafetyFilterConfig {
  toxicity: {
    model: string;
    threshold: number;
    enabled: boolean;
  };
  pii_detection: {
    patterns: string[];
    masking: boolean;
    enabled: boolean;
  };
  bias_detection: {
    model: string;
    threshold: number;
    enabled: boolean;
  };
  harmful_content: {
    categories: string[];
    threshold: number;
    enabled: boolean;
  };
}

/**
 * Audit event for security logging
 */
export interface SafetyAuditEvent {
  timestamp: string;
  event_type: 'injection_detected' | 'xpia_attempt' | 'safety_threshold_exceeded' | 'policy_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  tenant_id?: string;
  session_id?: string;
  details: Record<string, any>;
  action_taken: 'logged' | 'blocked' | 'escalated';
}

/**
 * Safety metrics snapshot
 */
export interface SafetyMetrics {
  tests_passed: number;
  tests_failed: number;
  injection_attempts_blocked: number;
  xpia_incidents: number;
  safety_threshold_violations: number;
  last_update: string;
}
