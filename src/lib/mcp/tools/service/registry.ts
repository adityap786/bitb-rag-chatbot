/**
 * Service Tool Registry
 *
 * Dedicated registry for service-based business tools, strictly accessible only to service tenants.
 * Each tool is defined with a schema, handler, and metadata for RBAC and audit.
 */
import { MCPToolDefinition } from '../../types';
import {
  bookAppointment,
  qualifyLead,
  escalateToHuman,
  checkAvailability,
  serviceAnalytics
} from './handlers';

// --- Strict Access Control ---
// Only allow access to SERVICE_TOOLS if tenant type is 'service'.
export function enforceServiceAccess(tenantType: string) {
  if (tenantType !== 'service') {
    throw new Error('Access denied: Service tools are only available to service tenants.');
  }
}

export const SERVICE_TOOLS: Record<string, MCPToolDefinition> = {
  book_appointment: {
    name: 'book_appointment',
    description: 'Book an appointment for a customer',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['datetime', 'customer_id'],
      properties: {
        datetime: { type: 'string', format: 'date-time' },
        customer_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: bookAppointment,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  qualify_lead: {
    name: 'qualify_lead',
    description: 'Score and qualify a sales lead',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['lead_id'],
      properties: {
        lead_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: qualifyLead,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 20, max_calls_per_hour: 200 },
  },
  escalate_to_human: {
    name: 'escalate_to_human',
    description: 'Escalate a support request to a human agent',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['ticket_id'],
      properties: {
        ticket_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: escalateToHuman,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  check_availability: {
    name: 'check_availability',
    description: 'Check availability for a resource or service',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['resource_id'],
      properties: {
        resource_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: checkAvailability,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 30, max_calls_per_hour: 300 },
  },
  service_analytics: {
    name: 'service_analytics',
    description: 'Generate analytics and insights for the service business',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['service_id'],
      properties: {
        service_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: serviceAnalytics,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  }
};

export function getServiceToolDefinition(toolName: string) {
  return SERVICE_TOOLS[toolName] || null;
}

export function isValidServiceTool(toolName: string): boolean {
  return toolName in SERVICE_TOOLS;
}

export function getAllServiceToolNames(): string[] {
  return Object.keys(SERVICE_TOOLS);
}
