// Trial tenant types
export interface TrialTenant {
  tenant_id: string;
  email: string;
  business_name: string | null;
  business_type: 'service' | 'ecommerce' | 'saas' | 'other';
  created_at: string;
  expires_at: string;
  // Legacy fields kept for backward compatibility with older responses
  trial_expires_at?: string;
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'active' | 'expired' | 'upgraded' | 'cancelled';
  plan: string | null;
  plan_upgraded_to?: string | null;
  setup_token?: string | null;
  rag_status?: 'pending' | 'processing' | 'ready' | 'failed';
}

export interface TrialStartRequest {
  email: string;
  businessName: string;
  businessType: 'service' | 'ecommerce' | 'saas' | 'other';
}

export interface TrialStartResponse {
  tenantId: string;
  trialExpiresAt: string; // ISO 8601
  setupToken: string; // JWT for subsequent steps
}

// API Error Response
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, any>;
}

// Knowledge Base types
export interface KnowledgeBase {
  kb_id: string;
  tenant_id: string;
  source_type: 'upload' | 'crawl' | 'manual';
  content_hash: string;
  raw_text: string;
  metadata: Record<string, any>;
  processed_at: string | null;
  created_at: string;
}

export interface KBUploadRequest {
  files: File[];
}

export interface KBUploadResponse {
  uploadedFiles: Array<{
    filename: string;
    kbId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    error?: string;
  }>;
  processingEstimate: number;
}

export interface CrawlRequest {
  startUrl: string;
  maxPages?: number; // default 20, max 50
  maxDepth?: number; // default 2, max 3
}

export interface CrawlResponse {
  crawlJobId: string;
  status: 'queued' | 'running';
  estimatedPages: number;
}

export interface ManualKBRequest {
  companyInfo: string; // max 10,000 chars
  faqs?: Array<{ question: string; answer: string }>;
}

export interface CrawlJob {
  job_id: string;
  tenant_id: string;
  start_url: string;
  max_pages: number;
  max_depth: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  pages_crawled: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// KB Analysis types
export interface KBAnalysis {
  hasSchedulingKeywords: boolean;
  hasProductCatalog: boolean;
  hasApiDocs: boolean;
  averageDocLength: number;
  topicClusters: string[];
}

// Widget configuration types
export interface WidgetConfig {
  config_id: string;
  tenant_id: string;
  primary_color: string;
  secondary_color: string;
  chat_tone: 'professional' | 'friendly' | 'casual';
  welcome_message: string;
  placeholder_text: string;
  assigned_tools: string[];
  prompt_template: string | null;
  avatar_url?: string;
  framework?: string | null;
  hosting?: string | null;
  platform?: string | null;
  knowledge_base_sources?: string[] | null;
  updated_at: string;
  created_at: string;
}

export interface BrandingRequest {
  primaryColor: string; // hex
  secondaryColor: string;
  tone: 'professional' | 'friendly' | 'casual';
  welcomeMessage?: string;
  platform?: string;
  framework?: string;
  hosting?: string;
  logoUrl?: string;
  knowledgeBaseSources?: string[];
}

export interface GenerateWidgetResponse {
  embedCode: string;
  widgetUrl: string;
  previewUrl: string;
  assignedTools: string[];
}

export interface WidgetEmbedCode {
  scriptTag: string;
  integrity: string; // SRI hash
  nonce?: string; // CSP nonce
}

// Tool assignment types
export interface ToolAssignmentRules {
  businessType: string;
  mandatoryTools: string[];
  optionalTools: string[];
  promptModifiers: Record<string, string>;
}

// RAG Pipeline types
export interface RAGPipelineConfig {
  tenantId: string;
  chunkSize?: number; // default 512 tokens
  chunkOverlap?: number; // default 50 tokens
  embeddingModel?: string; // 'openai-ada-002'
}

export interface Embedding {
  embedding_id: string;
  kb_id: string;
  tenant_id: string;
  chunk_text: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at: string;
}

// RAG Pipeline Internal Types
export interface EmbeddingChunk {
  kbId: string;
  text: string;
  metadata: Record<string, any>;
}

export interface SemanticSearchResult {
  embedding_id: string;
  kb_id: string;
  chunk_text: string;
  similarity: number;
  metadata: Record<string, any>;
}

export interface ChatSession {
  session_id: string;
  tenant_id: string;
  visitor_id: string;
  expires_at: string;
  messages: ChatMessage[];
  metadata: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: string;
}

export interface SessionInitRequest {
  tenantId: string;
  visitorId: string;
  referrer?: string;
}

export interface SessionInitResponse {
  sessionId: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  responseCharacterLimit?: 250 | 450; // Optional: Limit response length for brief summaries
}

export interface ChatResponse {
  reply: string;
  sources?: Array<{
    text: string;
    similarity: number;
  }>;
}

// Usage Monitoring Types
export interface TenantUsageMetrics {
  metric_id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  period_type: 'hourly' | 'daily' | 'monthly';
  
  // API metrics
  api_calls_total: number;
  api_calls_successful: number;
  api_calls_failed: number;
  api_calls_rate_limited: number;
  api_latency_avg_ms: number;
  api_latency_p95_ms: number;
  api_latency_p99_ms: number;
  
  // Chat metrics
  chat_messages_sent: number;
  chat_messages_received: number;
  chat_sessions_created: number;
  chat_avg_response_time_ms: number;
  
  // Embeddings metrics
  embeddings_generated: number;
  embeddings_tokens_used: number;
  semantic_searches_performed: number;
  kb_documents_ingested: number;
  kb_documents_failed: number;
  
  // Quota
  total_tokens_used: number;
  estimated_cost_usd: number;
  quota_limit: number | null;
  quota_remaining: number;
  quota_exceeded_count: number;
  
  // Performance
  error_count: number;
  error_rate: number;
  peak_qps: number;
  
  created_at: string;
  updated_at: string;
}

export interface UsageEventPayload {
  tenant_id: string;
  event_type: 'api_call' | 'chat_message' | 'embedding' | 'search' | 'kb_ingest';
  event_timestamp: string;
  tokens_consumed: number;
  cost_usd?: number;
  api_response_time_ms?: number;
  api_status_code?: number;
  metadata?: Record<string, any>;
}

export interface AuditEventPayload {
  tenant_id?: string;
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  actor_type?: string;
  actor_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  changes_summary?: string;
  result?: 'success' | 'failure' | 'partial';
  error_message?: string;
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  tokens_remaining: number;
  quota_limit: number | null;
  error?: string;
}

