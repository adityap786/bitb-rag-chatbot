# Hybrid Framework Technical Specifications

## Component API Specifications

### 1. LlamaIndex: TenantIngestionPipeline

```typescript
/**
 * Orchestrates document ingestion with advanced chunking and metadata extraction
 */
class TenantIngestionPipeline {
  private splitter: SentenceSplitter | SemanticSplitter | HierarchicalNodeParser;
  private extractors: MetadataExtractor[];
  private embedModel: OpenAIEmbedding;
  private cache: IngestionCache;
  private tenantStore: TenantIsolatedVectorStore;

  constructor(config: IngestionPipelineConfig) {
    // Initialize components based on config
  }

  /**
   * Ingest new documents for a tenant
   * @param docs - Documents to ingest
   * @param tenantId - Tenant identifier
   * @param options - Ingestion options (chunking strategy, extractors)
   * @returns IngestionReport with stats and errors
   */
  async ingest(
    docs: Document[], 
    tenantId: string,
    options?: IngestionOptions
  ): Promise<IngestionReport>;

  /**
   * Perform delta update for changed documents
   * @param changes - Document changes (added, modified, deleted)
   * @param tenantId - Tenant identifier
   * @returns DeltaUpdateReport with applied changes
   */
  async deltaUpdate(
    changes: DocumentChange[], 
    tenantId: string
  ): Promise<DeltaUpdateReport>;

  /**
   * Full sync of KB from source
   * @param tenantId - Tenant identifier
   * @param source - Data source (URL, file path, etc)
   * @returns SyncReport with sync status
   */
  async fullSync(
    tenantId: string, 
    source: DataSource
  ): Promise<SyncReport>;

  /**
   * Validate KB integrity
   * @param tenantId - Tenant identifier
   * @returns ValidationReport with issues found
   */
  async validate(tenantId: string): Promise<ValidationReport>;
}

interface IngestionPipelineConfig {
  chunkingStrategy: 'sentence' | 'semantic' | 'hierarchical';
  chunkSize: number;
  chunkOverlap: number;
  extractors: ('keywords' | 'summary' | 'questions' | 'entities')[];
  embedModel: 'text-embedding-ada-002' | 'text-embedding-3-small';
  cacheEnabled: boolean;
  cacheTTL: number; // seconds
}

interface IngestionOptions {
  skipEmbedding?: boolean;
  extractMetadata?: boolean;
  validateSchema?: boolean;
  batchSize?: number;
}

interface IngestionReport {
  tenantId: string;
  totalDocuments: number;
  successCount: number;
  failureCount: number;
  totalChunks: number;
  totalTokens: number;
  duration: number; // ms
  errors: IngestionError[];
  metadata: Record<string, any>;
}
```

---

### 2. LlamaIndex: HybridQueryEngine

```typescript
/**
 * Advanced query engine with hybrid search, reranking, and decomposition
 */
class HybridQueryEngine {
  private vectorRetriever: VectorStoreRetriever;
  private bm25Retriever: BM25Retriever;
  private fusionRetriever: QueryFusionRetriever;
  private reranker: SentenceTransformerRerank | CohereRerank;
  private queryTransform?: HyDEQueryTransform | StepDecomposeQueryTransform;
  private subqueryEngine?: SubQuestionQueryEngine;

  constructor(config: QueryEngineConfig) {
    // Initialize components
  }

  /**
   * Execute query with hybrid search and reranking
   * @param query - User query
   * @param tenantId - Tenant identifier
   * @param options - Query options
   * @returns QueryResult with ranked documents and metadata
   */
  async query(
    query: string, 
    tenantId: string, 
    options?: QueryOptions
  ): Promise<QueryResult>;

  /**
   * Decompose complex query into subqueries
   * @param query - Complex query
   * @returns Array of subqueries with dependencies
   */
  async subqueryDecompose(query: string): Promise<SubQuery[]>;

  /**
   * Transform query for better retrieval
   * @param query - Original query
   * @param method - Transformation method
   * @returns Transformed query
   */
  async transformQuery(
    query: string, 
    method: 'hyde' | 'decompose' | 'rewrite'
  ): Promise<string | string[]>;

  /**
   * Retrieve documents with detailed scoring
   * @param query - User query
   * @param tenantId - Tenant identifier
   * @param k - Number of results
   * @returns Ranked documents with scores
   */
  async retrieve(
    query: string, 
    tenantId: string, 
    k: number
  ): Promise<RetrievedDocument[]>;
}

interface QueryEngineConfig {
  hybridSearchEnabled: boolean;
  hybridAlpha: number; // 0=keyword only, 1=vector only
  vectorTopK: number;
  bm25TopK: number;
  reranker: 'sentence-transformer' | 'cohere' | 'llm' | 'none';
  rerankTopK: number;
  queryTransform?: 'hyde' | 'decompose' | 'rewrite';
  subqueryEnabled: boolean;
}

interface QueryOptions {
  filters?: MetadataFilter[];
  similarityThreshold?: number;
  rerank?: boolean;
  transformQuery?: boolean;
  includeMetadata?: boolean;
  maxTokens?: number;
}

interface QueryResult {
  query: string;
  documents: RetrievedDocument[];
  metadata: {
    retrievalMethod: 'hybrid' | 'vector' | 'keyword';
    vectorScore: number;
    keywordScore: number;
    fusionScore: number;
    reranked: boolean;
    latency: number; // ms
    cacheHit: boolean;
  };
}

interface RetrievedDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
  rank: number;
  retrievalMethod: 'vector' | 'keyword' | 'hybrid';
}
```

---

### 3. LangChain: ConversationOrchestrator

```typescript
/**
 * Orchestrates conversation flow with intent routing and memory management
 */
class ConversationOrchestrator {
  private router: LLMRouterChain;
  private memory: ConversationBufferMemory | ConversationSummaryMemory;
  private entityMemory: EntityMemory;
  private tools: Map<string, Tool>;
  private agents: Map<string, BaseAgent>;
  private guardrails: GuardrailsEngine;

  constructor(config: OrchestratorConfig) {
    // Initialize components
  }

  /**
   * Handle incoming message with routing and orchestration
   * @param message - User message
   * @param sessionId - Session identifier
   * @param context - Additional context (tenant, user)
   * @returns Orchestrated response
   */
  async handleMessage(
    message: string, 
    sessionId: string,
    context: ConversationContext
  ): Promise<OrchestratorResponse>;

  /**
   * Route query to appropriate handler
   * @param query - User query
   * @param context - Conversation context
   * @returns Routing decision with confidence
   */
  async routeQuery(
    query: string, 
    context: ConversationContext
  ): Promise<RouteDecision>;

  /**
   * Execute multi-step workflow
   * @param workflow - Workflow definition
   * @param input - Initial input
   * @returns Workflow result
   */
  async executeWorkflow(
    workflow: WorkflowDefinition, 
    input: any
  ): Promise<WorkflowResult>;

  /**
   * Manage conversation memory
   * @param sessionId - Session identifier
   * @param operation - Memory operation
   * @returns Memory state
   */
  async manageMemory(
    sessionId: string, 
    operation: MemoryOperation
  ): Promise<MemoryState>;
}

interface OrchestratorConfig {
  routerModel: string;
  memoryType: 'buffer' | 'summary' | 'entity';
  memoryWindow: number; // number of messages
  guardrailsEnabled: boolean;
  toolsEnabled: string[];
  agentsEnabled: string[];
  cacheEnabled: boolean;
}

interface ConversationContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  userTier: 'free' | 'pro' | 'enterprise';
  conversationHistory: ConversationMessage[];
  entities: ExtractedEntity[];
  metadata: Record<string, any>;
}

interface OrchestratorResponse {
  answer: string;
  intent: string;
  confidence: number;
  route: 'kb_query' | 'web_search' | 'calculation' | 'tool_call' | 'escalation';
  sources?: Source[];
  toolCalls?: ToolCall[];
  suggestedActions?: string[];
  metadata: {
    latency: number;
    cacheHit: boolean;
    memoryUpdated: boolean;
  };
}

interface RouteDecision {
  intent: string;
  confidence: number;
  route: string;
  reasoning?: string;
  fallback?: string;
}
```

---

### 4. LangChain: MultiAgentSystem

```typescript
/**
 * Coordinates multiple specialized agents for complex tasks
 */
class MultiAgentSystem {
  private agents: Map<string, BaseAgent>;
  private supervisor: SupervisorAgent;
  private sharedContext: SharedContextManager;
  private delegationGraph: DelegationGraph;
  private auditLogger: AuditLogger;

  constructor(config: MultiAgentConfig) {
    // Initialize agents and infrastructure
  }

  /**
   * Execute task using appropriate agent(s)
   * @param task - Task to execute
   * @param context - Execution context
   * @returns Task result with agent metadata
   */
  async executeTask(
    task: Task, 
    context: ExecutionContext
  ): Promise<TaskResult>;

  /**
   * Delegate subtask to specialized agent
   * @param agentId - Target agent identifier
   * @param subtask - Subtask to delegate
   * @param context - Shared context
   * @returns Subtask result
   */
  async delegateToAgent(
    agentId: string, 
    subtask: Task,
    context: SharedContext
  ): Promise<SubTaskResult>;

  /**
   * Coordinate multiple agents for parallel execution
   * @param tasks - Tasks to execute
   * @param strategy - Coordination strategy
   * @returns Aggregated results
   */
  async coordinateAgents(
    tasks: Task[], 
    strategy: CoordinationStrategy
  ): Promise<AggregatedResult>;

  /**
   * Monitor agent performance and health
   * @returns Agent health metrics
   */
  async monitorAgents(): Promise<AgentHealthMetrics[]>;
}

interface MultiAgentConfig {
  agents: AgentDefinition[];
  supervisorEnabled: boolean;
  maxConcurrentAgents: number;
  delegationEnabled: boolean;
  sharedContextEnabled: boolean;
  auditLoggingEnabled: boolean;
}

interface Task {
  id: string;
  type: string;
  description: string;
  input: any;
  requirements: string[];
  constraints: Record<string, any>;
  priority: number;
}

interface TaskResult {
  taskId: string;
  agentId: string;
  success: boolean;
  output: any;
  metadata: {
    duration: number;
    iterations: number;
    toolCalls: ToolCall[];
    delegations: string[];
  };
  errors?: Error[];
}

interface AgentDefinition {
  id: string;
  name: string;
  type: 'react' | 'plan-execute' | 'kb' | 'research' | 'support';
  capabilities: string[];
  tools: string[];
  config: Record<string, any>;
}
```

---

### 5. Unified: HybridQueryPipeline

```typescript
/**
 * End-to-end query pipeline integrating LlamaIndex RAG + LangChain orchestration
 */
class HybridQueryPipeline {
  private orchestrator: ConversationOrchestrator;
  private queryEngine: HybridQueryEngine;
  private synthesizer: ResponseSynthesizer;
  private cache: MultiLayerCache;
  private circuitBreaker: CircuitBreaker;
  private tracer: DistributedTracer;

  constructor(config: PipelineConfig) {
    // Initialize all components
  }

  /**
   * Process query end-to-end
   * @param query - User query
   * @param context - Request context
   * @returns Complete response
   */
  async process(
    query: string, 
    context: RequestContext
  ): Promise<PipelineResponse>;

  /**
   * Execute pipeline stage by stage
   * @param query - User query
   * @param context - Request context
   * @returns Stage-by-stage results
   */
  async processWithStages(
    query: string, 
    context: RequestContext
  ): Promise<StageResults>;

  /**
   * Health check for pipeline
   * @returns Health status of all components
   */
  async healthCheck(): Promise<HealthStatus>;

  /**
   * Get pipeline metrics
   * @param timeRange - Time range for metrics
   * @returns Pipeline metrics
   */
  async getMetrics(timeRange: TimeRange): Promise<PipelineMetrics>;
}

interface PipelineConfig {
  orchestratorConfig: OrchestratorConfig;
  queryEngineConfig: QueryEngineConfig;
  caching: {
    enabled: boolean;
    layers: ('router' | 'retrieval' | 'synthesis')[];
    ttls: Record<string, number>;
  };
  circuitBreaker: {
    enabled: boolean;
    threshold: number;
    timeout: number;
  };
  tracing: {
    enabled: boolean;
    samplingRate: number;
    exporter: 'jaeger' | 'datadog' | 'console';
  };
}

interface RequestContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  conversationHistory: ConversationMessage[];
  metadata: Record<string, any>;
}

interface PipelineResponse {
  answer: string;
  sources: Source[];
  confidence: number;
  intent: string;
  route: string;
  metadata: {
    stages: {
      routing: StageMetadata;
      retrieval: StageMetadata;
      reranking: StageMetadata;
      synthesis: StageMetadata;
    };
    totalLatency: number;
    cacheHits: string[];
    traceId: string;
  };
}

interface StageMetadata {
  latency: number;
  cacheHit: boolean;
  error?: string;
  metadata: Record<string, any>;
}
```

---

## Data Models

### Document Schema

```typescript
interface Document {
  id: string;
  content: string;
  metadata: {
    tenant_id: string;
    url: string;
    title: string;
    section?: string;
    author?: string;
    date?: string;
    keywords?: string[];
    summary?: string;
    questions?: string[];
    entities?: ExtractedEntity[];
    chunk_hierarchy?: string[]; // ['doc', 'section', 'paragraph']
    chunk_index?: number;
    parent_id?: string;
    version: number;
    created_at: string;
    updated_at: string;
  };
}

interface ExtractedEntity {
  text: string;
  type: 'person' | 'product' | 'feature' | 'date' | 'location' | 'other';
  confidence: number;
}
```

### Vector Store Schema

```sql
-- Enhanced documents table with hierarchical metadata
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  content TEXT NOT NULL,
  embedding_768 vector(768),
  metadata JSONB NOT NULL,
  
  -- Metadata indexes
  url TEXT,
  title TEXT,
  section TEXT,
  keywords TEXT[],
  summary TEXT,
  questions TEXT[],
  entities JSONB,
  
  -- Hierarchy
  chunk_hierarchy TEXT[],
  parent_id UUID REFERENCES documents(id),
  
  -- Versioning
  version INTEGER DEFAULT 1,
  content_hash TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full-text search
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  
  -- Indexes
  CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Indexes for hybrid search
CREATE INDEX idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_documents_content_tsv ON documents USING GIN (content_tsv);
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_documents_metadata ON documents USING GIN (metadata);
CREATE INDEX idx_documents_keywords ON documents USING GIN (keywords);
CREATE INDEX idx_documents_parent_id ON documents(parent_id) WHERE parent_id IS NOT NULL;
```

### Conversation Memory Schema

```sql
-- Conversation sessions
CREATE TABLE conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, archived, expired
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Conversation messages
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  intent TEXT,
  route TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracted entities from conversations
CREATE TABLE conversation_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_value TEXT NOT NULL,
  confidence DECIMAL(3,2),
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_sessions_tenant ON conversation_sessions(tenant_id);
CREATE INDEX idx_conversation_messages_session ON conversation_messages(session_id);
CREATE INDEX idx_conversation_entities_session ON conversation_entities(session_id);
```

---

## Configuration Files

### Environment Variables

```bash
# LlamaIndex Configuration
LLAMAINDEX_CHUNKING_STRATEGY=semantic  # sentence|semantic|hierarchical
LLAMAINDEX_CHUNK_SIZE=512
LLAMAINDEX_CHUNK_OVERLAP=128
LLAMAINDEX_EMBED_MODEL=text-embedding-ada-002
LLAMAINDEX_HYBRID_ALPHA=0.5  # 0=keyword, 1=vector
LLAMAINDEX_RERANKER=sentence-transformer  # sentence-transformer|cohere|llm|none
LLAMAINDEX_RERANK_TOP_K=5
LLAMAINDEX_INGESTION_CACHE_ENABLED=true
LLAMAINDEX_INGESTION_CACHE_TTL=2592000  # 30 days

# LangChain Configuration
LANGCHAIN_ORCHESTRATION_ENABLED=true
LANGCHAIN_MEMORY_TYPE=buffer  # buffer|summary|entity
LANGCHAIN_MEMORY_WINDOW=10
LANGCHAIN_ROUTER_MODEL=gpt-4o-mini
LANGCHAIN_AGENT_MAX_ITERATIONS=5
LANGCHAIN_AGENT_TIMEOUT=30000  # ms
LANGCHAIN_GUARDRAILS_ENABLED=true

# Hybrid Pipeline Configuration
PIPELINE_CACHING_ENABLED=true
PIPELINE_CACHE_ROUTER_TTL=300  # 5 min
PIPELINE_CACHE_RETRIEVAL_TTL=600  # 10 min
PIPELINE_CACHE_SYNTHESIS_TTL=1800  # 30 min
PIPELINE_CIRCUIT_BREAKER_ENABLED=true
PIPELINE_CIRCUIT_BREAKER_THRESHOLD=0.2  # 20% failure rate
PIPELINE_CIRCUIT_BREAKER_TIMEOUT=60000  # 60s

# Observability
TRACING_ENABLED=true
TRACING_SAMPLING_RATE=0.1  # 10%
TRACING_EXPORTER=jaeger  # jaeger|datadog|console
```

---

## Migration Path

### Phase 1: Foundation (Week 1)
1. Implement `TenantIngestionPipeline` with basic chunking
2. Create `HybridQueryEngine` with vector search only
3. Build `ConversationOrchestrator` with simple routing
4. Add basic observability (logging)

### Phase 2: Enhancement (Week 2)
1. Add advanced chunking strategies (semantic, hierarchical)
2. Implement hybrid search (vector + BM25)
3. Add reranking pipeline
4. Implement conversation memory

### Phase 3: Optimization (Week 3)
1. Add query transformation (HyDE, decomposition)
2. Implement multi-agent system
3. Add comprehensive caching
4. Optimize performance (batching, parallel execution)

### Phase 4: Production (Week 4)
1. Add guardrails and safety checks
2. Implement distributed tracing
3. Load testing and tuning
4. Documentation and runbooks
