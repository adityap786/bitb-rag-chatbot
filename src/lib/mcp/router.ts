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
): Promise<NextResponse> {
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
      return tenantValidation as NextResponse;
    }

    // --- E-com Agent Integration ---
    // Determine tenant type (for demo, infer from tool name prefix or add real lookup)
    // In production, fetch tenant type from DB or context
    let tenantType = 'default';
    if (mcpRequest.tool && [
      'catalog_ingestion','payment_link','inventory_sync','product_detail','order_tracking','returns_and_refunds','abandoned_cart_recovery','fraud_check','product_review_summary','personalized_recommendation','size_and_fit_recommender','bundle_and_bogo_engine','check_availability_realtime','add_to_cart','initiate_checkout','subscription_and_replenishment','explain_recommendation','website_navigation','compare_price_across_sellers','analytics_insight_generator'
    ].includes(mcpRequest.tool)) {
      tenantType = 'ecom';
    }

    if (tenantType === 'ecom') {
      // Dynamically import agent to avoid circular deps
      const { EcomReACTAgent } = await import('../agents/ecomAgent');
      const agent = new EcomReACTAgent(mcpRequest.tenant_id, tenantType);
      // Use the user query from parameters if present
      const userQuery = mcpRequest.parameters?.query || mcpRequest.tool;
      const agentResult = await agent.run(userQuery);
      // Telemetry: log agent action
      await AuditLogger.logMCPToolInvocation(
        mcpRequest.tenant_id,
        'EcomReACTAgent',
        {
          success: true,
          execution_time_ms: Date.now() - startTime,
          agent_steps: agentResult.steps.length,
        }
      );
      return NextResponse.json({
        success: true,
        data: {
          final_answer: agentResult.finalAnswer,
          steps: agentResult.steps,
        },
        metadata: {
          execution_time_ms: Date.now() - startTime,
          agent: 'EcomReACTAgent',
        },
      });
    }

    // --- Default: Route to tool handler as before ---
    // GUARDRAIL: Rate limiting (per-tenant, per-tool)
    const rateLimitConfig = getRateLimitConfigForTool(mcpRequest.tool as MCPToolName);
    if (rateLimitConfig) {
      const identifier = getRateLimitIdentifier(request, rateLimitConfig.identifier_type, {
        tenant_id: mcpRequest.tenant_id,
        tool_name: mcpRequest.tool,
      });

      const rateLimitResponse = await rateLimitMiddleware(request, rateLimitConfig, identifier);
      if (rateLimitResponse) {
        return rateLimitResponse as NextResponse;
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
    // Core tools
    rag_query: RATE_LIMITS.MCP_RAG_QUERY,
    ingest_documents: RATE_LIMITS.MCP_INGEST,
    get_trial_status: RATE_LIMITS.MCP_TRIAL_STATUS,
    update_settings: RATE_LIMITS.MCP_UPDATE_SETTINGS,
    // E-com tools (default to null, handled by per-tenant config)
    catalog_ingestion: null,
    payment_link: null,
    inventory_sync: null,
    product_detail: null,
    order_tracking: null,
    returns_and_refunds: null,
    abandoned_cart_recovery: null,
    fraud_check: null,
    product_review_summary: null,
    personalized_recommendation: null,
    size_and_fit_recommender: null,
    bundle_and_bogo_engine: null,
    check_availability_realtime: null,
    add_to_cart: null,
    initiate_checkout: null,
    subscription_and_replenishment: null,
    explain_recommendation: null,
    website_navigation: null,
    compare_price_across_sellers: null,
    analytics_insight_generator: null,
    // Service tools (default to null, handled by per-tenant config)
    book_appointment: null,
    qualify_lead: null,
    escalate_to_human: null,
    check_availability: null,
    service_analytics: null,
  };

  return rateLimitMap[toolName] || null;
}
