/**
 * MCP Parameter Validator
 * 
 * Validates tool parameters against JSON Schema definitions.
 * Uses Ajv for schema validation with custom error formatting.
 */

import Ajv from 'ajv';
import { getToolDefinition } from './registry';

const ajv = new Ajv({ allErrors: true, coerceTypes: true });

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
}

/**
 * Validate parameters against tool schema
 */
export function validateToolParameters(
  toolName: string,
  parameters: Record<string, unknown>
): ValidationResult {
  const toolDef = getToolDefinition(toolName);
  
  if (!toolDef) {
    return {
      valid: false,
      errors: [{
        field: 'tool',
        message: `Unknown tool: ${toolName}`,
      }],
    };
  }

  const validate = ajv.compile(toolDef.parameters_schema);
  const valid = validate(parameters);

  if (valid) {
    return { valid: true };
  }

  // Format Ajv errors
  const errors = (validate.errors || []).map((error) => {
    const field = ((error as any).instancePath?.replace(/^\//, '') || 
                  (error.params as any).missingProperty || 
                  'parameters');
    let message = error.message || 'Validation failed';

    // Enhance error messages
    if (error.keyword === 'required') {
      message = `Missing required field: ${(error.params as any).missingProperty}`;
    } else if (error.keyword === 'type') {
      message = `Invalid type: expected ${(error.params as any).type}`;
    } else if (error.keyword === 'minLength') {
      message = `Must be at least ${(error.params as any).limit} characters`;
    } else if (error.keyword === 'maxLength') {
      message = `Must be at most ${(error.params as any).limit} characters`;
    } else if (error.keyword === 'minimum') {
      message = `Must be at least ${(error.params as any).limit}`;
    } else if (error.keyword === 'maximum') {
      message = `Must be at most ${(error.params as any).limit}`;
    } else if (error.keyword === 'enum') {
      message = `Must be one of: ${(error.params as any).allowedValues?.join(', ')}`;
    } else if (error.keyword === 'pattern') {
      message = `Must match pattern: ${(error.params as any).pattern}`;
    }

    return {
      field,
      message,
      value: error.data,
    };
  });

  return {
    valid: false,
    errors,
  };
}

/**
 * Validate tenant_id format
 */
export function validateTenantIdFormat(tenantId: unknown): ValidationResult {
  if (typeof tenantId !== 'string') {
    return {
      valid: false,
      errors: [{
        field: 'tenant_id',
        message: 'tenant_id must be a string',
      }],
    };
  }

  const pattern = /^tn_[a-f0-9]{32}$/;
  if (!pattern.test(tenantId)) {
    return {
      valid: false,
      errors: [{
        field: 'tenant_id',
        message: 'Invalid tenant_id format (expected: tn_[32 hex chars])',
        value: tenantId,
      }],
    };
  }

  return { valid: true };
}

/**
 * Validate trial_token format
 */
export function validateTrialTokenFormat(trialToken: unknown): ValidationResult {
  if (typeof trialToken !== 'string') {
    return {
      valid: false,
      errors: [{
        field: 'trial_token',
        message: 'trial_token must be a string',
      }],
    };
  }

  const pattern = /^tr_[a-f0-9]{32}$/;
  if (!pattern.test(trialToken)) {
    return {
      valid: false,
      errors: [{
        field: 'trial_token',
        message: 'Invalid trial_token format (expected: tr_[32 hex chars])',
        value: trialToken,
      }],
    };
  }

  return { valid: true };
}

/**
 * Validate complete MCP request
 */
export function validateMCPRequest(request: unknown): ValidationResult {
  if (typeof request !== 'object' || request === null) {
    return {
      valid: false,
      errors: [{
        field: 'request',
        message: 'Request must be an object',
      }],
    };
  }

  const req = request as Record<string, unknown>;

  // Validate required fields
  if (!req.tool) {
    return {
      valid: false,
      errors: [{
        field: 'tool',
        message: 'Missing required field: tool',
      }],
    };
  }

  if (!req.tenant_id) {
    return {
      valid: false,
      errors: [{
        field: 'tenant_id',
        message: 'Missing required field: tenant_id',
      }],
    };
  }

  if (!req.parameters || typeof req.parameters !== 'object') {
    return {
      valid: false,
      errors: [{
        field: 'parameters',
        message: 'Missing or invalid parameters object',
      }],
    };
  }

  // Validate tenant_id format
  const tenantIdValidation = validateTenantIdFormat(req.tenant_id);
  if (!tenantIdValidation.valid) {
    return tenantIdValidation;
  }

  // Validate trial_token format if provided
  if (req.trial_token) {
    const tokenValidation = validateTrialTokenFormat(req.trial_token);
    if (!tokenValidation.valid) {
      return tokenValidation;
    }
  }

  // Validate tool-specific parameters
  return validateToolParameters(
    req.tool as string,
    req.parameters as Record<string, unknown>
  );
}
