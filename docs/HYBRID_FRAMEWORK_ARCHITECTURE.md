# Hybrid Framework Architecture: LlamaIndex + LangChain

## Architecture Philosophy

**LlamaIndex**: RAG Pipeline & Data Layer
- Document ingestion & chunking
- Metadata extraction & enrichment
- Vector store management (per-tenant isolation)
- Hybrid search (vector + keyword)
- Query transformation & reranking
- Subquery decomposition
- Delta updates & sync jobs

**LangChain**: Orchestration & Brain Layer
- Multi-step workflows
- Conditional routing logic
- Tool orchestration (web search, calculators, APIs)
- Conversation memory & dialogue management
- Agent-based decision making
- Chain composition

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Next.js)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              LangChain Orchestration Layer                  │
│  • ConversationChain (dialogue management)                  │
│  • RouterChain (intent classification)                      │
│  • ToolChain (external tool execution)                      │
│  • AgentExecutor (multi-step reasoning)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
         ┌──────────┐  ┌──────────┐  ┌──────────┐
         │ KB Query │  │ Web Tool │  │ Calc Tool│
         └──────────┘  └──────────┘  └──────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│               LlamaIndex RAG Pipeline                       │
│  • IngestionPipeline (chunking + embedding)                 │
│  • VectorStoreIndex (per-tenant Supabase)                   │
│  • QueryEngine (hybrid search + reranking)                  │
│  • SubQuestionQueryEngine (decomposition)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│        Supabase Vector Store (Tenant Isolated)              │
│  • pgvector embeddings                                       │
│  • RLS policies                                              │
│  • Full-text search (pg_trgm)                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase-by-Phase Implementation Plan

### **PHASE 1: LlamaIndex Document Ingestion Pipeline** (Days 1-3)

#### 1.1 Advanced Chunking with LlamaIndex
- Replace simple text splitting with `SentenceSplitter`
- Use `SemanticSplitterNodeParser` for semantic boundaries
- Implement `HierarchicalNodeParser` for document structure
- Support multiple chunk strategies (sentence, semantic, hierarchical)

#### 1.2 Metadata Extraction & Enrichment
- Use `KeywordExtractor` for automatic keyword generation
- Implement `SummaryExtractor` for chunk summaries
- Add `QuestionsAnsweredExtractor` for query optimization
- Custom metadata extractors (entities, topics, dates)

#### 1.3 Per-Tenant Vector Store Management
- Create `TenantIsolatedVectorStore` wrapper
- Implement tenant-specific indexes with namespace isolation
- Add `StorageContext` management per tenant
- Implement index versioning for A/B testing

#### 1.4 Delta Updates & Sync Jobs
- Implement `DocumentUpdateTracker` for change detection
- Use `IngestionCache` to avoid re-embedding unchanged docs
- Create `SyncJob` scheduler for periodic updates
- Add conflict resolution for concurrent updates

---

### **PHASE 2: LlamaIndex Advanced Retrieval** (Days 4-6)

#### 2.1 Hybrid Search Implementation
- Combine `VectorStoreRetriever` + `BM25Retriever`
- Implement `QueryFusionRetriever` for result merging
- Add reciprocal rank fusion (RRF) scoring
- Tune alpha parameter for vector/keyword balance

#### 2.2 Query Transformation
- Use `HyDEQueryTransform` (Hypothetical Document Embeddings)
- Implement `StepDecomposeQueryTransform` for complex queries
- Add `QueryRewritingRetriever` for synonym expansion
- Multi-query generation for diverse results

#### 2.3 Reranking Pipeline
- Integrate `SentenceTransformerRerank` (cross-encoder)
- Implement `CohereRerank` for production scaling
- Add `LLMRerank` as fallback
- Configure reranking threshold and top-k

#### 2.4 Subquery Decomposition
- Create `SubQuestionQueryEngine` for multi-part queries
- Implement `MultiStepQueryEngine` for sequential reasoning
- Add query dependency tracking
- Parallel subquery execution with result aggregation

---

### **PHASE 3: LangChain Orchestration Layer** (Days 7-9)

#### 3.1 Conversation & Dialogue Management
- Use `ConversationBufferMemory` for short-term context
- Implement `ConversationSummaryMemory` for long sessions
- Add `EntityMemory` for customer data tracking
- Create session persistence in Redis

#### 3.2 Intent Classification & Routing
- Build `LLMRouterChain` for query intent detection
- Categories: kb_query, web_search, calculation, order_status, escalation
- Implement confidence thresholds for routing
- Add fallback routing for ambiguous queries

#### 3.3 Multi-Step Workflows
- Create `SequentialChain` for ordered operations
- Implement `ConditionalChain` for branching logic
- Add `LoopChain` for iterative refinement
- Workflow state persistence

#### 3.4 Tool Orchestration
- Define tool schemas (KB search, web search, calculator, DB query)
- Create `ToolExecutor` with error handling
- Implement tool result caching
- Add tool usage telemetry

---

### **PHASE 4: LangChain Agent System** (Days 10-12)

#### 4.1 ReAct Agent Implementation
- Build `ReActAgent` for reasoning + action
- Define action space (tools + KB)
- Implement thought/action/observation loop
- Add max iterations and timeout guards

#### 4.2 Specialized Agents
- **KB Agent**: Handles knowledge base queries via LlamaIndex
- **Research Agent**: Uses web search + synthesis
- **Support Agent**: Order tracking + customer data
- **Escalation Agent**: Determines human handoff

#### 4.3 Multi-Agent Coordination
- Create `SupervisorAgent` for agent routing
- Implement agent-to-agent delegation
- Add shared context between agents
- Result aggregation and formatting

#### 4.4 Guardrails & Safety
- Input validation (PII detection, prompt injection)
- Output filtering (profanity, policy violations)
- Rate limiting per tenant
- Audit logging for agent actions

---

### **PHASE 5: Integration & Optimization** (Days 13-15)

#### 5.1 Unified Query Pipeline
- Create `HybridQueryPipeline` class
- LangChain router → LlamaIndex retrieval → LangChain synthesis
- Implement caching at each layer
- Add circuit breakers for external services

#### 5.2 Performance Optimization
- Batch embedding operations in LlamaIndex
- Parallel tool execution in LangChain
- Redis caching for frequent queries
- Connection pooling for Supabase

#### 5.3 Observability
- Trace full request path (router → retrieval → generation)
- Log latency at each stage
- Monitor cache hit rates
- Track tool usage patterns

#### 5.4 Testing & Validation
- E2E tests: user query → final response
- Component tests: each chain/engine independently
- Load testing: 100 concurrent requests
- Quality tests: response accuracy vs ground truth

---

## Component Specifications

### LlamaIndex Components

#### `TenantIngestionPipeline`
```typescript
class TenantIngestionPipeline {
  private splitter: SentenceSplitter;
  private extractors: MetadataExtractor[];
  private embedModel: OpenAIEmbedding;
  
  async ingest(docs: Document[], tenantId: string): Promise<void>;
  async deltaUpdate(changes: DocumentChange[], tenantId: string): Promise<void>;
  async fullSync(tenantId: string): Promise<SyncReport>;
}
```

#### `HybridQueryEngine`
```typescript
class HybridQueryEngine {
  private vectorRetriever: VectorStoreRetriever;
  private bm25Retriever: BM25Retriever;
  private reranker: SentenceTransformerRerank;
  
  async query(query: string, tenantId: string, options: QueryOptions): Promise<QueryResult>;
  async subqueryDecompose(query: string): Promise<SubQuery[]>;
}
```

### LangChain Components

#### `ConversationOrchestrator`
```typescript
class ConversationOrchestrator {
  private router: LLMRouterChain;
  private memory: ConversationBufferMemory;
  private tools: Tool[];
  
  async handleMessage(message: string, sessionId: string): Promise<OrchestratorResponse>;
  async routeQuery(query: string): Promise<RouteDecision>;
}
```

#### `MultiAgentSystem`
```typescript
class MultiAgentSystem {
  private agents: Map<string, BaseAgent>;
  private supervisor: SupervisorAgent;
  
  async executeTask(task: Task, context: Context): Promise<TaskResult>;
  async delegateToAgent(agentId: string, subtask: Task): Promise<SubTaskResult>;
}
```

---

## Feature Flags

```typescript
// LlamaIndex features
USE_LLAMAINDEX_INGESTION=true          // Default: true
USE_SEMANTIC_CHUNKING=true             // Default: false (use sentence)
USE_HYBRID_SEARCH=true                 // Default: true
ENABLE_RERANKING=true                  // Default: true
ENABLE_SUBQUERY_DECOMPOSITION=false    // Default: false (expensive)

// LangChain features
USE_LANGCHAIN_ORCHESTRATION=true       // Default: true
ENABLE_MULTI_AGENT=false               // Default: false (Phase 4)
ENABLE_WEB_SEARCH_TOOL=true            // Default: true
CONVERSATION_MEMORY_TYPE=buffer        // buffer|summary|entity

// Hybrid mode
RAG_BACKEND=hybrid                     // llamaindex|langchain|hybrid
ORCHESTRATION_BACKEND=langchain        // langchain|custom
```

---

## Migration Strategy

### Week 1: Foundation
- **Day 1-2**: Implement LlamaIndex ingestion pipeline
- **Day 3**: Add metadata extraction and enrichment
- **Day 4-5**: Build hybrid search with reranking

### Week 2: Advanced Retrieval
- **Day 6-7**: Query transformation and subquery decomposition
- **Day 8-9**: Integrate LangChain conversation management
- **Day 10**: Build router chain for intent classification

### Week 3: Orchestration
- **Day 11-12**: Implement tool orchestration
- **Day 13-14**: Build multi-step workflows
- **Day 15**: E2E testing and optimization

### Week 4: Production Hardening
- **Day 16-17**: Agent system implementation
- **Day 18**: Observability and monitoring
- **Day 19**: Load testing and performance tuning
- **Day 20**: Documentation and runbooks

---

## Success Metrics

### RAG Quality (LlamaIndex)
- **Retrieval precision**: >0.85 (relevant docs in top-5)
- **Retrieval recall**: >0.80 (all relevant docs found)
- **Reranking improvement**: +15% precision vs baseline
- **Delta update latency**: <2s for 100 docs

### Orchestration Quality (LangChain)
- **Intent classification accuracy**: >0.90
- **Multi-turn conversation coherence**: >0.85 (human eval)
- **Tool selection accuracy**: >0.88
- **Handoff precision**: <5% false escalations

### Performance
- **P50 query latency**: <500ms
- **P95 query latency**: <1500ms
- **Concurrent users**: 1000+ (sustained)
- **Cache hit rate**: >60%

### Reliability
- **Uptime**: 99.9%
- **Error rate**: <0.1%
- **Timeout rate**: <1%
- **Circuit breaker activations**: <10/day

---

## Risk Mitigation

### Technical Risks
1. **Framework incompatibility**: Wrap each framework in adapter layer
2. **Performance degradation**: Extensive caching + parallel execution
3. **State management**: Redis for distributed state + idempotency keys
4. **Complex debugging**: Structured logging + distributed tracing

### Operational Risks
1. **Gradual rollout**: Feature flags + A/B testing
2. **Rollback plan**: Keep legacy code until full validation
3. **Monitoring**: Real-time dashboards + alerting
4. **Runbooks**: Incident response procedures

---

## Cost Optimization

### LlamaIndex Optimizations
- Batch embeddings (100x cheaper per call)
- Reuse embeddings with `IngestionCache`
- Tune chunk size to reduce total embeddings
- Use cheaper models for metadata extraction

### LangChain Optimizations
- Cache LLM responses (exact match + fuzzy)
- Use smaller models for routing (gpt-4o-mini)
- Limit conversation history (sliding window)
- Async tool execution (parallel)

---

## Next Steps

1. ✅ Review and approve architecture
2. 🔲 Set up development environment
3. 🔲 Implement Phase 1 (LlamaIndex ingestion)
4. 🔲 Create integration tests
5. 🔲 Deploy to staging
6. 🔲 Run pilot with 10 tenants
7. 🔲 Full production rollout
