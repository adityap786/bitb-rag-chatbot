/**
 * MCP Router - Central Tool Orchestrator
 * 
 * Routes incoming MCP requests to the appropriate tool handler.
 * Handles validation, authentication, rate limiting, and error handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateMCPRequest } from './validator';
import { getToolDefinition } from './registry';
import { validateTenantContext } from '../middleware/tenant-context';
import { 
  rateLimitMiddleware, 
  getRateLimitIdentifier, 
  RATE_LIMITS 
} from '../security/rate-limiting';
import { AuditLogger } from '../security/audit-logging';
import type { MCPToolRequest, MCPToolResponse, MCPToolName } from './types';

/**
 * Route MCP request to appropriate handler
 */
export async function routeMCPRequest(
  request: NextRequest
): Promise<NextResponse<MCPToolResponse>> {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json();

    // Validate request structure
    const validation = validateMCPRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request validation failed',
            details: validation.errors,
          },
        },
        { status: 400 }
      );
    }

    const mcpRequest = body as MCPToolRequest;

    // Get tool definition
    const toolDef = getToolDefinition(mcpRequest.tool);
    if (!toolDef) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNKNOWN_TOOL',
            message: `Tool not found: ${mcpRequest.tool}`,
          },
        },
        { status: 404 }
      );
    }

    // Validate tenant context (security check)
    const tenantValidation = await validateTenantContext(request);
    if (tenantValidation) {
      return tenantValidation as NextResponse<MCPToolResponse>;
    }

    // GUARDRAIL: Rate limiting (per-tenant, per-tool)
    const rateLimitConfig = getRateLimitConfigForTool(mcpRequest.tool as MCPToolName);
    if (rateLimitConfig) {
      const identifier = getRateLimitIdentifier(request, rateLimitConfig.identifier_type, {
        tenant_id: mcpRequest.tenant_id,
        tool_name: mcpRequest.tool,
      });

      const rateLimitResponse = await rateLimitMiddleware(request, rateLimitConfig, identifier);
      if (rateLimitResponse) {
        return rateLimitResponse as NextResponse<MCPToolResponse>;
      }
    }

    // Check if trial_token is required
    if (toolDef.requires_trial_token && !mcpRequest.trial_token) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TRIAL_TOKEN_REQUIRED',
            message: `Tool ${mcpRequest.tool} requires a trial_token`,
          },
        },
        { status: 401 }
      );
    }

    // Route to tool handler
    const handler = getToolHandler(mcpRequest.tool as MCPToolName);
    if (!handler) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'HANDLER_NOT_FOUND',
            message: `No handler registered for tool: ${mcpRequest.tool}`,
          },
        },
        { status: 500 }
      );
    }

    // Execute tool handler
    const response = await handler(mcpRequest);

    // Add execution metadata
    const executionTime = Date.now() - startTime;

    // GUARDRAIL: Audit log MCP tool invocation
    await AuditLogger.logMCPToolInvocation(
      mcpRequest.tenant_id,
      mcpRequest.tool,
      {
        success: response.success,
        execution_time_ms: executionTime,
        error_code: response.error?.code,
      }
    );

    return NextResponse.json({
      ...response,
      metadata: {
        ...response.metadata,
        execution_time_ms: executionTime,
        tool_version: toolDef.version,
      },
    });

  } catch (error) {
    console.error('MCP Router Error:', error);
    
    const executionTime = Date.now() - startTime;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred while processing the request',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          execution_time_ms: executionTime,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Tool handler function type
 */
type ToolHandler = (request: MCPToolRequest) => Promise<MCPToolResponse>;

/**
 * Tool handler registry
 */
const toolHandlers: Partial<Record<MCPToolName, ToolHandler>> = {};

/**
 * Register a tool handler
 */
export function registerToolHandler(
  toolName: MCPToolName,
  handler: ToolHandler
): void {
  toolHandlers[toolName] = handler;
}

/**
 * Get registered tool handler
 */
function getToolHandler(toolName: MCPToolName): ToolHandler | null {
  return toolHandlers[toolName] || null;
}

/**
 * Export registry for testing
 */
export function getRegisteredHandlers(): MCPToolName[] {
  return Object.keys(toolHandlers) as MCPToolName[];
}

/**
 * Get rate limit config for specific tool
 */
function getRateLimitConfigForTool(toolName: MCPToolName) {
  const rateLimitMap: Record<MCPToolName, typeof RATE_LIMITS[keyof typeof RATE_LIMITS] | null> = {
    rag_query: RATE_LIMITS.MCP_RAG_QUERY,
    ingest_documents: RATE_LIMITS.MCP_INGEST,
    get_trial_status: RATE_LIMITS.MCP_TRIAL_STATUS,
    update_settings: RATE_LIMITS.MCP_UPDATE_SETTINGS,
  };

  return rateLimitMap[toolName] || null;
}
