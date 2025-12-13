/**
 * MCP Tool Registry
 * 
 * Centralized registry of all MCP tools with JSON Schema definitions
 * for validation and documentation.
 */

import { MCPToolDefinition, MCPToolName } from './types';
import {
  handleRagQuery,
  handleIngestDocuments,
  handleGetTrialStatus,
  handleUpdateSettings
} from './handlers';

/**
 * JSON Schema for rag_query parameters
 */
const ragQuerySchema = {
  type: 'object',
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'The search query or question',
    },
    k: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      default: 3,
      description: 'Number of results to return',
    },
    similarity_threshold: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      default: 0.0,
      description: 'Minimum similarity score (0-1)',
    },
    include_metadata: {
      type: 'boolean',
      default: true,
      description: 'Include document metadata in response',
    },
  },
  additionalProperties: false,
};

/**
 * JSON Schema for ingest_documents parameters
 */
const ingestDocumentsSchema = {
  type: 'object',
  required: ['documents'],
  properties: {
    documents: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        required: ['content'],
        properties: {
          content: {
            type: 'string',
            minLength: 1,
            maxLength: 50000,
            description: 'Document text content',
          },
          metadata: {
            type: 'object',
            description: 'Optional document metadata',
          },
        },
      },
      description: 'Array of documents to ingest',
    },
    chunk_size: {
      type: 'number',
      minimum: 100,
      maximum: 2000,
      default: 1000,
      description: 'Characters per chunk',
    },
    chunk_overlap: {
      type: 'number',
      minimum: 0,
      maximum: 500,
      default: 200,
      description: 'Overlap between chunks',
    },
  },
  additionalProperties: false,
};

/**
 * JSON Schema for get_trial_status parameters
 */
const getTrialStatusSchema = {
  type: 'object',
  properties: {
    include_usage: {
      type: 'boolean',
      default: true,
      description: 'Include detailed usage statistics',
    },
  },
  additionalProperties: false,
};

/**
 * JSON Schema for update_settings parameters
 */
const updateSettingsSchema = {
  type: 'object',
  properties: {
    theme: {
      type: 'object',
      properties: {
        theme: {
          type: 'string',
          enum: ['light', 'dark', 'auto'],
          description: 'Color theme preference',
        },
        primary_color: {
          type: 'string',
          pattern: '^#[0-9A-Fa-f]{6}$',
          description: 'Primary color (hex format)',
        },
        position: {
          type: 'string',
          enum: ['bottom-right', 'bottom-left'],
          description: 'Widget position',
        },
      },
      additionalProperties: false,
    },
    display_name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Chatbot display name',
    },
    greeting_message: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'Greeting message shown to users',
    },
    placeholder_text: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Input placeholder text',
    },
  },
  additionalProperties: false,
};

/**
 * Tool registry with metadata
 */
export const MCP_TOOLS: Partial<Record<MCPToolName, MCPToolDefinition>> = {
  rag_query: {
    name: 'rag_query',
    description: 'Perform semantic search over knowledge base and return relevant documents',
    version: '1.0.0',
    parameters_schema: ragQuerySchema,
    requires_trial_token: true,
    rate_limit: {
      max_calls_per_minute: 20,
      max_calls_per_hour: 200,
    },
    handler: handleRagQuery,
  },
  ingest_documents: {
    name: 'ingest_documents',
    description: 'Add documents to tenant knowledge base with automatic chunking and embedding',
    version: '1.0.0',
    parameters_schema: ingestDocumentsSchema,
    requires_trial_token: false,
    rate_limit: {
      max_calls_per_minute: 5,
      max_calls_per_hour: 50,
    },
    handler: handleIngestDocuments,
  },
  get_trial_status: {
    name: 'get_trial_status',
    description: 'Retrieve trial information, usage statistics, and remaining quota',
    version: '1.0.0',
    parameters_schema: getTrialStatusSchema,
    requires_trial_token: true,
    rate_limit: {
      max_calls_per_minute: 30,
      max_calls_per_hour: 300,
    },
    handler: handleGetTrialStatus,
  },
  update_settings: {
    name: 'update_settings',
    description: 'Update chatbot configuration including theme, display name, and messages',
    version: '1.0.0',
    parameters_schema: updateSettingsSchema,
    requires_trial_token: false,
    rate_limit: {
      max_calls_per_minute: 10,
      max_calls_per_hour: 100,
    },
    handler: handleUpdateSettings,
  },
};

/**
 * Get tool definition by name
 */
export function getToolDefinition(toolName: string): MCPToolDefinition | null {
  return (MCP_TOOLS[toolName as MCPToolName] as MCPToolDefinition | undefined) ?? null;
}

/**
 * Check if tool exists
 */
export function isValidTool(toolName: string): toolName is MCPToolName {
  return Boolean(MCP_TOOLS[toolName as MCPToolName]);
}

/**
 * Get all tool names
 */
export function getAllToolNames(): MCPToolName[] {
  return Object.keys(MCP_TOOLS) as MCPToolName[];
}
