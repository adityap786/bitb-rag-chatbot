/**
 * MCP Tool Handlers
 * 
 * Implements the business logic for each MCP tool.
 * Handlers are deterministic, typed, and follow the MCP response contract.
 * 
 * SECURITY:
 * - PII masking before LLM calls
 * - Audit logging for all operations
 * - Rate limiting enforced at router level
 */

import { getSupabaseRetriever } from '../rag/supabase-retriever';
import { 
  incrementQueryUsage, 
  checkQueryLimit
} from '../middleware/tenant-context';
import { PIIMasker, detectPII } from '../security/pii-masking';
import { createLlm } from '../rag/llm-factory';
import { AuditLogger, hashSensitiveData } from '../security/audit-logging';
import TrialLogger from '../trial/logger';
import type {
  MCPToolRequest,
  RagQueryParameters,
  RagQueryResponse,
  IngestDocumentsParameters,
  IngestDocumentsResponse,
  GetTrialStatusParameters,
  GetTrialStatusResponse,
  UpdateSettingsParameters,
  UpdateSettingsResponse,
} from './types';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Tool: rag_query
 * Performs semantic search over tenant's knowledge base
 * 
 * SECURITY: PII masking + audit logging
 */
export async function handleRagQuery(
  request: MCPToolRequest
): Promise<RagQueryResponse> {
  const startTime = Date.now();
  // Monitoring: import metrics
  const { recordApiCall } = await import('../monitoring');
  const params = request.parameters as unknown as RagQueryParameters;
  const { tenant_id, trial_token } = request;

  // GUARDRAIL 1: Detect and mask PII before processing
  const piiDetections = detectPII(params.query);
  if (piiDetections.length > 0) {
    // Log PII detection
    await AuditLogger.logPIIDetection(
      tenant_id,
      piiDetections.map(d => d.type),
      hashSensitiveData(params.query)
    );
  }

  // Mask PII for LLM/vector search
  const maskingResult = PIIMasker.forLLM(params.query);
  const sanitizedQuery = maskingResult.masked_text;

  // Check query limit
  if (trial_token) {
    const { allowed, remaining } = await checkQueryLimit(tenant_id, trial_token);
    if (!allowed) {
      // GUARDRAIL 2: Audit log rate limit exceeded
      await AuditLogger.logRagQuery(tenant_id, params.query, {
        trial_token,
        result_count: 0,
        execution_time_ms: Date.now() - startTime,
        success: false,
      });

      // Monitoring: record error API call for MCP rag_query
      recordApiCall('mcp_tool_rag_query', 429, Date.now() - startTime);
      return {
        success: false,
        data: {
          answer: '',
          sources: [],
          confidence: 0,
          queries_remaining: 0,
        },
        error: {
          code: 'QUERY_LIMIT_EXCEEDED',
          message: 'Trial query limit exceeded',
          details: { queries_remaining: 0 },
        },
      };
    }
  }

  // Use enhanced hybrid RAG with Groq Llama-3-70B
  const { mcpHybridRagQuery } = await import('../ragPipeline');
  
  // Get tenant LLM preferences
  const supabase = createClient(supabaseUrl, supabaseKey);
  await supabase.rpc('set_tenant_context', { p_tenant_id: tenant_id });
  const { data: trial } = await supabase
    .from('trials')
    .select('llm_provider, llm_model')
    .eq('tenant_id', tenant_id)
    .single();

  const llmProvider = trial?.llm_provider || 'groq';
  const llmModel = trial?.llm_model || 'llama-3-groq-70b-8192-tool-use-preview';

  // Run hybrid search + LLM synthesis
  const ragResult = await mcpHybridRagQuery({
    tenantId: tenant_id,
    query: sanitizedQuery,
    k: params.k ?? 4,
    llmProvider,
    llmModel,
    responseCharacterLimit: params.responseCharacterLimit, // Optional character limit
  });
  const responseTime = Date.now() - startTime;
  // Monitoring: record API call for MCP rag_query
  recordApiCall('mcp_tool_rag_query', 200, responseTime);

  const answer = ragResult.answer;
  const sources = ragResult.sources.map((s: any) => ({
    content: s.chunk,
    metadata: params.include_metadata !== false ? { title: s.title, index: s.index } : {},
    similarity_score: s.score,
  }));
  const confidence = ragResult.confidence;

  // Increment usage
  if (trial_token) {
    await incrementQueryUsage(tenant_id, trial_token);
  }

  // Get remaining queries
  let queries_remaining: number | undefined;
  if (trial_token) {
    const { remaining } = await checkQueryLimit(tenant_id, trial_token);
    queries_remaining = remaining;
  }

  const executionTime = Date.now() - startTime;

  // GUARDRAIL 3: Audit log successful query (hashed)
  await AuditLogger.logRagQuery(tenant_id, params.query, {
    trial_token,
    result_count: sources.length,
    execution_time_ms: executionTime,
    success: true,
  });

  // Log request and response metrics
  TrialLogger.logRequest(
    'MCP_TOOL',
    'rag_query',
    200,
    Date.now() - startTime,
    {
      tenantId: tenant_id,
      responseCharacterLimit: ragResult.characterLimitApplied || null,
      originalLength: ragResult.originalLength || null,
      replyLength: ragResult.answer.length,
      error: ragResult.llmError || null,
    }
  );

  return {
    success: true,
    data: {
      answer,
      sources,
      confidence,
      queries_remaining,
    },
  };
}
/**
 * Tool: ingest_documents
 * Adds documents to tenant's knowledge base
 * 
 * SECURITY: Audit logging
 */
export async function handleIngestDocuments(
  request: MCPToolRequest
): Promise<IngestDocumentsResponse> {
  const params = request.parameters as unknown as IngestDocumentsParameters;
  const { tenant_id } = request;

  // TODO: Implement document chunking and embedding
  // For now, return a placeholder response

  const job_id = 'job_' + Math.random().toString(36).substring(2, 15);
  const documents_count = params.documents.length;

  // Estimate chunks (rough calculation)
  const chunk_size = params.chunk_size ?? 1000;
  const total_chars = params.documents.reduce((sum, doc) => sum + doc.content.length, 0);
  const chunks_created = Math.ceil(total_chars / chunk_size);

  // GUARDRAIL: Audit log document ingestion
  await AuditLogger.logDocumentIngest(tenant_id, {
    document_count: documents_count,
    chunk_count: chunks_created,
    total_chars,
    job_id,
    success: true,
  });

  // No error monitoring needed here; return placeholder response
  return {
    success: true,
    data: {
      job_id,
      documents_count,
      chunks_created,
      status: 'queued',
      estimated_completion_time: new Date(Date.now() + 60000).toISOString(), // 1 minute
    },
  };
}
export async function handleGetTrialStatus(
  request: MCPToolRequest
): Promise<GetTrialStatusResponse> {
  const params = request.parameters as GetTrialStatusParameters;
  const { tenant_id, trial_token } = request;

  if (!trial_token) {
    return {
      success: false,
      data: {} as any,
      error: {
        code: 'TRIAL_TOKEN_REQUIRED',
        message: 'Trial token is required for this operation',
      },
    };
  }

  // Query trial info
  const supabase = createClient(supabaseUrl, supabaseKey);
  await supabase.rpc('set_tenant_context', { tenant_id });
  
  const { data: trialInfo, error: queryError } = await supabase
    .from('trials')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('trial_token', trial_token)
    .single();
  
  if (queryError || !trialInfo) {
    return {
      success: false,
      data: {} as any,
      error: {
        code: 'INVALID_TRIAL',
        message: 'Trial not found or expired',
      },
    };
  }

  const queries_remaining = trialInfo.queries_limit - trialInfo.queries_used;

  // Get embeddings count if requested
  let embeddings_count: number | undefined;
  if (params.include_usage !== false) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.rpc('set_tenant_context', { tenant_id });
    
    const { count } = await supabase
      .from('embeddings')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id);
    
    embeddings_count = count ?? 0;
  }

  return {
    success: true,
    data: {
      tenant_id,
      trial_token,
      status: trialInfo.status,
      created_at: trialInfo.created_at,
      expires_at: trialInfo.expires_at,
      queries_used: trialInfo.queries_used,
      queries_limit: trialInfo.queries_limit,
      queries_remaining,
      embeddings_count,
      site_origin: trialInfo.site_origin,
      display_name: trialInfo.display_name,
    },
  };
}
/**
 * Tool: update_settings
 * Updates chatbot configuration for tenant
 * 
 * SECURITY: Audit logging
 */
export async function handleUpdateSettings(
  request: MCPToolRequest
): Promise<UpdateSettingsResponse> {
  const params = request.parameters as UpdateSettingsParameters;
  const { tenant_id } = request;

  const supabase = createClient(supabaseUrl, supabaseKey);
  await supabase.rpc('set_tenant_context', { tenant_id });

  // Build update object
  const updates: Record<string, any> = {};
  const updated_fields: string[] = [];

  if (params.theme) {
    updates.theme = params.theme;
    updated_fields.push('theme');
  }

  if (params.display_name) {
    updates.display_name = params.display_name;
    updated_fields.push('display_name');
  }

  if (params.greeting_message || params.placeholder_text) {
    // Store in theme object for now (can create separate settings table later)
    updates.theme = {
      ...updates.theme,
      greeting_message: params.greeting_message,
      placeholder_text: params.placeholder_text,
    };
    if (params.greeting_message) updated_fields.push('greeting_message');
    if (params.placeholder_text) updated_fields.push('placeholder_text');
  }

  // Update trials table
  const { error } = await supabase
    .from('trials')
    .update(updates)
    .eq('tenant_id', tenant_id);

  if (error) {
    return {
      success: false,
      data: {} as any,
      error: {
        code: 'UPDATE_FAILED',
        message: 'Failed to update settings',
        details: error.message,
      },
    };
  }

  // GUARDRAIL: Audit log settings update
  await AuditLogger.logSettingsUpdate(tenant_id, updated_fields);

  return {
    success: true,
    data: {
      updated_fields,
      settings: updates,
    },
  };
}
