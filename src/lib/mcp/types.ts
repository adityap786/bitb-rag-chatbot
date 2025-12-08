/**
 * MCP (Model Context Protocol) Type Definitions
 * 
 * Defines the typed tool interfaces and request/response schemas
 * for the MCP router. All tools must conform to these types.
 */

/**
 * Base tool request structure
 */
export interface MCPToolRequest {
  tool: string;
  tenant_id: string;
  trial_token?: string;
  parameters: Record<string, unknown>;
}

/**
 * Base tool response structure
 */
export interface MCPToolResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    execution_time_ms?: number;
    tool_version?: string;
    [key: string]: unknown;
  };
}

/**
 * Tool: rag_query
 * Performs semantic search over tenant's knowledge base
 */
export interface RagQueryParameters {
  query: string;
  k?: number; // Number of results to return (default: 3)
  similarity_threshold?: number; // Minimum similarity score (default: 0.0)
  include_metadata?: boolean; // Include document metadata (default: true)
  responseCharacterLimit?: 250 | 450; // Optional: Limit response length for brief summaries
}

export interface RagQueryResponse extends MCPToolResponse {
  data: {
    answer: string;
    sources: Array<{
      content: string;
      metadata: Record<string, unknown>;
      similarity_score?: number;
    }>;
    confidence: number;
    queries_remaining?: number;
  };
}

/**
 * Tool: ingest_documents
 * Adds documents to tenant's knowledge base
 */
export interface IngestDocumentsParameters {
  documents: Array<{
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  chunk_size?: number; // Characters per chunk (default: 1000)
  chunk_overlap?: number; // Overlap between chunks (default: 200)
}

export interface IngestDocumentsResponse extends MCPToolResponse {
  data: {
    job_id: string;
    documents_count: number;
    chunks_created: number;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    estimated_completion_time?: string;
  };
}

/**
 * Tool: get_trial_status
 * Retrieves trial information and usage statistics
 */
export interface GetTrialStatusParameters {
  include_usage?: boolean; // Include detailed usage stats (default: true)
}

export interface GetTrialStatusResponse extends MCPToolResponse {
  data: {
    tenant_id: string;
    trial_token: string;
    status: 'active' | 'expired' | 'suspended';
    created_at: string;
    expires_at: string;
    queries_used: number;
    queries_limit: number;
    queries_remaining: number;
    embeddings_count?: number;
    site_origin?: string;
    display_name?: string;
  };
}

/**
 * Tool: update_settings
 * Updates chatbot configuration for tenant
 */
export interface UpdateSettingsParameters {
  theme?: {
    theme?: 'light' | 'dark' | 'auto';
    primary_color?: string;
    position?: 'bottom-right' | 'bottom-left';
  };
  display_name?: string;
  greeting_message?: string;
  placeholder_text?: string;
}

export interface UpdateSettingsResponse extends MCPToolResponse {
  data: {
    updated_fields: string[];
    settings: Record<string, unknown>;
  };
}

/**
 * MCP Tool Registry
 * Maps tool names to their parameter/response types
 */
export type MCPToolName = 
  // Core tools
  | 'rag_query'
  | 'ingest_documents'
  | 'get_trial_status'
  | 'update_settings'
  // E-com tools
  | 'catalog_ingestion'
  | 'payment_link'
  | 'inventory_sync'
  | 'product_detail'
  | 'order_tracking'
  | 'returns_and_refunds'
  | 'abandoned_cart_recovery'
  | 'fraud_check'
  | 'product_review_summary'
  | 'personalized_recommendation'
  | 'size_and_fit_recommender'
  | 'bundle_and_bogo_engine'
  | 'check_availability_realtime'
  | 'add_to_cart'
  | 'initiate_checkout'
  | 'subscription_and_replenishment'
  | 'explain_recommendation'
  | 'website_navigation'
  | 'compare_price_across_sellers'
  | 'analytics_insight_generator'
  // Service tools
  | 'book_appointment'
  | 'qualify_lead'
  | 'escalate_to_human'
  | 'check_availability'
  | 'service_analytics';

/**
 * Tool parameter type mapping
 */
export type MCPToolParameters<T extends MCPToolName> = 
  T extends 'rag_query' ? RagQueryParameters :
  T extends 'ingest_documents' ? IngestDocumentsParameters :
  T extends 'get_trial_status' ? GetTrialStatusParameters :
  T extends 'update_settings' ? UpdateSettingsParameters :
  never;

/**
 * Tool response type mapping
 */
export type MCPToolResponseType<T extends MCPToolName> = 
  T extends 'rag_query' ? RagQueryResponse :
  T extends 'ingest_documents' ? IngestDocumentsResponse :
  T extends 'get_trial_status' ? GetTrialStatusResponse :
  T extends 'update_settings' ? UpdateSettingsResponse :
  never;

/**
 * Tool metadata for registration
 */
export interface MCPToolDefinition {
  name: MCPToolName;
  description: string;
  version: string;
  parameters_schema: Record<string, unknown>; // JSON Schema
  requires_trial_token: boolean;
  rate_limit?: {
    max_calls_per_minute: number;
    max_calls_per_hour: number;
  };
  handler: (req: MCPToolRequest) => Promise<MCPToolResponse> | MCPToolResponse;
}
