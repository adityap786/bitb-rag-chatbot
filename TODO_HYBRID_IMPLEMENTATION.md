# Hybrid Framework Implementation TODO List

## PHASE 1: LlamaIndex Document Ingestion Pipeline (Days 1-3)

### 1.1 Advanced Chunking (Priority: HIGH)
- [ ] **Task 1.1.1**: Implement LlamaIndex SentenceSplitter
  - Replace simple text chunking with SentenceSplitter
  - Configure chunk_size=512, chunk_overlap=128
  - Support multiple languages
  - Add unit tests for boundary cases
  - File: `src/lib/rag/llamaindex-chunking.ts`

- [ ] **Task 1.1.2**: Add SemanticSplitterNodeParser
  - Implement semantic chunking using embedding similarity
  - Configure buffer_size=1, breakpoint_percentile_threshold=95
  - Test with technical docs and conversational content
  - Compare quality vs sentence splitting
  - File: `src/lib/rag/llamaindex-semantic-chunking.ts`

- [ ] **Task 1.1.3**: Implement HierarchicalNodeParser
  - Create hierarchical chunk structure (document → sections → paragraphs)
  - Preserve parent-child relationships in metadata
  - Store chunk_hierarchy field
  - Test with structured docs (markdown, HTML)
  - File: `src/lib/rag/llamaindex-hierarchical-chunking.ts`

### 1.2 Metadata Extraction & Enrichment (Priority: HIGH)
- [ ] **Task 1.2.1**: Add KeywordExtractor metadata
  - Use LlamaIndex KeywordExtractor to generate keywords per chunk
  - Store in metadata.keywords array
  - Configure max_keywords=5
  - Test precision and recall
  - File: `src/lib/rag/llamaindex-metadata-extractors.ts`

- [ ] **Task 1.2.2**: Implement SummaryExtractor
  - Add chunk-level summaries using LLM
  - Store in metadata.summary
  - Use gpt-4o-mini for cost efficiency
  - Batch process chunks (10 at a time)
  - File: `src/lib/rag/llamaindex-metadata-extractors.ts`

- [ ] **Task 1.2.3**: Add QuestionsAnsweredExtractor
  - Generate potential questions each chunk answers
  - Store in metadata.questions array
  - Use for query matching optimization
  - Test with 100 sample queries
  - File: `src/lib/rag/llamaindex-metadata-extractors.ts`

- [ ] **Task 1.2.4**: Create custom entity extractor
  - Extract entities (products, features, people, dates)
  - Use NER model or LLM
  - Store in metadata.entities
  - Add entity-based filtering for retrieval
  - File: `src/lib/rag/llamaindex-entity-extractor.ts`

### 1.3 Per-Tenant Vector Store Management (Priority: CRITICAL)
- [ ] **Task 1.3.1**: Build TenantIsolatedVectorStore wrapper
  - Wrap LlamaIndex VectorStore with tenant isolation
  - Use namespace or metadata filtering
  - Ensure RLS enforcement
  - Test cross-tenant isolation (negative tests)
  - File: `src/lib/rag/llamaindex-tenant-vector-store.ts`

- [ ] **Task 1.3.2**: Implement StorageContext per tenant
  - Create tenant-specific StorageContext
  - Isolated docstore, index_store, vector_store
  - Support multiple tenants in same Supabase instance
  - Add context caching (Redis)
  - File: `src/lib/rag/llamaindex-storage-context.ts`

- [ ] **Task 1.3.3**: Add index versioning system
  - Support multiple index versions per tenant (v1, v2, etc)
  - Enable A/B testing of different chunking strategies
  - Implement version rollback
  - Store version metadata
  - File: `src/lib/rag/llamaindex-index-versioning.ts`

### 1.4 Delta Updates & Sync Jobs (Priority: HIGH)
- [ ] **Task 1.4.1**: Create DocumentUpdateTracker
  - Track document changes (added, modified, deleted)
  - Use content hash for change detection
  - Store in document_versions table
  - Support incremental updates
  - File: `src/lib/rag/llamaindex-update-tracker.ts`

- [ ] **Task 1.4.2**: Implement IngestionCache
  - Use LlamaIndex IngestionCache to avoid re-embedding
  - Cache embeddings in Redis with TTL=30d
  - Test cache hit rate (target >80% for stable KBs)
  - File: `src/lib/rag/llamaindex-ingestion-cache.ts`

- [ ] **Task 1.4.3**: Build SyncJob scheduler
  - Create cron-based sync jobs for periodic KB updates
  - Support delta updates (only changed docs)
  - Add job status tracking
  - Implement retry logic with exponential backoff
  - File: `src/lib/rag/llamaindex-sync-jobs.ts`

- [ ] **Task 1.4.4**: Add conflict resolution
  - Handle concurrent document updates
  - Use optimistic locking (version numbers)
  - Detect conflicts and merge strategies
  - Add conflict logs
  - File: `src/lib/rag/llamaindex-conflict-resolution.ts`

---

## PHASE 2: LlamaIndex Advanced Retrieval (Days 4-6)

### 2.1 Hybrid Search Implementation (Priority: CRITICAL)
- [ ] **Task 2.1.1**: Implement VectorStoreRetriever
  - Use LlamaIndex VectorStoreRetriever for semantic search
  - Configure similarity_top_k=10
  - Add metadata filtering (tenant_id, date_range)
  - Test recall@k for k=1,3,5,10
  - File: `src/lib/rag/llamaindex-vector-retriever.ts`

- [ ] **Task 2.1.2**: Add BM25Retriever for keyword search
  - Implement BM25 sparse retrieval using pg_trgm
  - Index full-text content
  - Configure k1=1.5, b=0.75
  - Test on exact-match queries
  - File: `src/lib/rag/llamaindex-bm25-retriever.ts`

- [ ] **Task 2.1.3**: Build QueryFusionRetriever
  - Combine vector and BM25 results using RRF
  - Configure alpha parameter (0.5 = equal weight)
  - Test on diverse query types
  - File: `src/lib/rag/llamaindex-query-fusion.ts`

- [ ] **Task 2.1.4**: Tune hybrid search parameters
  - Run parameter sweep for alpha, similarity_top_k, bm25_top_k
  - Use golden test set (100 queries)
  - Optimize for nDCG@5
  - Document optimal params per use case
  - File: `tests/llamaindex-hybrid-search-tuning.test.ts`

### 2.2 Query Transformation (Priority: MEDIUM)
- [ ] **Task 2.2.1**: Implement HyDEQueryTransform
  - Generate hypothetical document for query
  - Embed and use for retrieval
  - Test latency impact (<200ms)
  - A/B test vs direct query
  - File: `src/lib/rag/llamaindex-hyde-transform.ts`

- [ ] **Task 2.2.2**: Add StepDecomposeQueryTransform
  - Break complex queries into simpler subqueries
  - Use LLM for decomposition
  - Execute subqueries sequentially
  - Aggregate results
  - File: `src/lib/rag/llamaindex-step-decompose.ts`

- [ ] **Task 2.2.3**: Create QueryRewritingRetriever
  - Expand query with synonyms, related terms
  - Generate 3-5 query variations
  - Retrieve for each, deduplicate
  - Test precision impact
  - File: `src/lib/rag/llamaindex-query-rewriting.ts`

- [ ] **Task 2.2.4**: Implement multi-query generation
  - Generate diverse phrasings of same query
  - Use LLM to create variations
  - Combine results for higher recall
  - Monitor latency (parallel execution)
  - File: `src/lib/rag/llamaindex-multi-query.ts`

### 2.3 Reranking Pipeline (Priority: HIGH)
- [ ] **Task 2.3.1**: Integrate SentenceTransformerRerank
  - Use cross-encoder model (ms-marco-MiniLM-L-12-v2)
  - Rerank top-20 to top-5
  - Test precision improvement (+15% target)
  - Measure latency (<100ms)
  - File: `src/lib/rag/llamaindex-reranker.ts`

- [ ] **Task 2.3.2**: Add CohereRerank integration
  - Use Cohere Rerank API for production
  - Configure model=rerank-english-v2.0
  - Handle rate limits
  - Cache rerank results (Redis)
  - File: `src/lib/rag/llamaindex-cohere-rerank.ts`

- [ ] **Task 2.3.3**: Implement LLMRerank fallback
  - Use LLM-based reranking when external unavailable
  - Test consistency vs cross-encoder
  - Use as backup only
  - File: `src/lib/rag/llamaindex-llm-rerank.ts`

- [ ] **Task 2.3.4**: Configure reranking thresholds
  - Set minimum relevance score
  - Tune top_k after reranking (3-5)
  - Test false positive rate
  - Add telemetry
  - File: `src/lib/rag/llamaindex-rerank-config.ts`

### 2.4 Subquery Decomposition (Priority: MEDIUM)
- [ ] **Task 2.4.1**: Create SubQuestionQueryEngine
  - Use LlamaIndex SubQuestionQueryEngine
  - Decompose complex queries
  - Execute in parallel
  - Synthesize answer
  - File: `src/lib/rag/llamaindex-subquestion-engine.ts`

- [ ] **Task 2.4.2**: Implement MultiStepQueryEngine
  - Execute queries sequentially (dependencies)
  - Track intermediate results
  - Support conditional branching
  - Test on reasoning chains
  - File: `src/lib/rag/llamaindex-multistep-engine.ts`

- [ ] **Task 2.4.3**: Add query dependency tracking
  - Model dependencies between subqueries (DAG)
  - Optimize execution order
  - Support parallel execution
  - Add visualization for debugging
  - File: `src/lib/rag/llamaindex-query-dag.ts`

- [ ] **Task 2.4.4**: Build result aggregation system
  - Combine answers from multiple subqueries
  - Handle conflicts (contradictory info)
  - Weighted aggregation by confidence
  - Citation tracking
  - File: `src/lib/rag/llamaindex-result-aggregation.ts`

---

## PHASE 3: LangChain Orchestration Layer (Days 7-9)

### 3.1 Conversation & Dialogue Management (Priority: HIGH)
- [ ] **Task 3.1.1**: Implement ConversationBufferMemory
  - Use LangChain ConversationBufferMemory
  - Store in Redis with session_id key
  - TTL=1h
  - Test context window management
  - File: `src/lib/langchain/conversation-buffer-memory.ts`

- [ ] **Task 3.1.2**: Add ConversationSummaryMemory
  - Summarize old messages to save tokens
  - Use for long sessions (>20 messages)
  - Store summary + recent messages
  - Test information retention
  - File: `src/lib/langchain/conversation-summary-memory.ts`

- [ ] **Task 3.1.3**: Create EntityMemory system
  - Extract and track entities across conversation
  - Store in structured format
  - Use for context injection
  - Test entity resolution
  - File: `src/lib/langchain/entity-memory.ts`

- [ ] **Task 3.1.4**: Build session persistence
  - Persist conversation state to Redis + Postgres
  - Support session resume after disconnect
  - Implement session timeout (24h)
  - Add session history view
  - File: `src/lib/langchain/session-persistence.ts`

### 3.2 Intent Classification & Routing (Priority: CRITICAL)
- [ ] **Task 3.2.1**: Build LLMRouterChain
  - Create intent classifier using LLM
  - Route to: kb_query, web_search, calculation, order_status, escalation
  - Return intent + confidence
  - Test accuracy on 500 queries (>90%)
  - File: `src/lib/langchain/router-chain.ts`

- [ ] **Task 3.2.2**: Define intent categories & examples
  - Document all intent types with 20+ examples each
  - Create few-shot prompts
  - Add edge cases
  - Maintain intent taxonomy
  - File: `docs/INTENT_TAXONOMY.md`

- [ ] **Task 3.2.3**: Implement confidence thresholds
  - Set minimum confidence per intent (0.7-0.9)
  - Route low-confidence to clarification
  - Track threshold effectiveness
  - A/B test different thresholds
  - File: `src/lib/langchain/router-chain.ts`

- [ ] **Task 3.2.4**: Add fallback routing logic
  - Handle ambiguous queries
  - Prompt user for clarification
  - Default to safest route
  - Log ambiguous cases
  - File: `src/lib/langchain/fallback-router.ts`

### 3.3 Multi-Step Workflows (Priority: HIGH)
- [ ] **Task 3.3.1**: Create SequentialChain for workflows
  - Build ordered operation chains
  - Pass output as input to next step
  - Support error handling at each step
  - Test multi-step workflows
  - File: `src/lib/langchain/sequential-chain.ts`

- [ ] **Task 3.3.2**: Implement ConditionalChain
  - Add branching logic based on conditions
  - Use if/else routing
  - Support multiple branches
  - Test decision tree workflows
  - File: `src/lib/langchain/conditional-chain.ts`

- [ ] **Task 3.3.3**: Build LoopChain for iteration
  - Implement iterative refinement loops
  - Set max iterations and convergence criteria
  - Use for query reformulation
  - Test convergence rate
  - File: `src/lib/langchain/loop-chain.ts`

- [ ] **Task 3.3.4**: Add workflow state persistence
  - Save workflow state at each step (Redis)
  - Support resume after failure
  - Implement checkpointing
  - Test long-running workflows
  - File: `src/lib/langchain/workflow-state.ts`

### 3.4 Tool Orchestration (Priority: HIGH)
- [ ] **Task 3.4.1**: Define tool schemas
  - Create schemas for all tools
  - Use JSON Schema
  - Document input/output formats
  - Add validation
  - File: `src/lib/langchain/tool-schemas.ts`

- [ ] **Task 3.4.2**: Build ToolExecutor with error handling
  - Execute tools with timeout, retry, circuit breaker
  - Handle tool failures gracefully
  - Log execution metrics
  - Return structured responses
  - File: `src/lib/langchain/tool-executor.ts`

- [ ] **Task 3.4.3**: Implement tool result caching
  - Cache tool outputs in Redis
  - Use cache key = tool_name + hash(inputs)
  - Test cache hit rate (target >50%)
  - Invalidate on data updates
  - File: `src/lib/langchain/tool-cache.ts`

- [ ] **Task 3.4.4**: Add tool usage telemetry
  - Track invocation count, success rate, latency
  - Create dashboard
  - Alert on high failure rates
  - Analyze usage patterns
  - File: `src/lib/langchain/tool-telemetry.ts`

---

## PHASE 4: LangChain Agent System (Days 10-12)

### 4.1 ReAct Agent Implementation (Priority: HIGH)
- [ ] **Task 4.1.1**: Build ReActAgent
  - Implement Reasoning + Action agent
  - Loop: thought → action → observation
  - Use LLM for reasoning
  - Set max_iterations=5
  - File: `src/lib/langchain/react-agent.ts`

- [ ] **Task 4.1.2**: Define agent action space
  - List all available actions
  - Document when to use each
  - Create action selection prompt
  - File: `src/lib/langchain/agent-actions.ts`

- [ ] **Task 4.1.3**: Implement thought/action/observation loop
  - Parse agent outputs
  - Handle malformed outputs
  - Add structured logging
  - Test loop termination
  - File: `src/lib/langchain/react-agent.ts`

- [ ] **Task 4.1.4**: Add iteration guards
  - Set max_iterations, timeout
  - Detect infinite loops
  - Force termination with partial result
  - Log guard activations
  - File: `src/lib/langchain/agent-guards.ts`

### 4.2 Specialized Agents (Priority: MEDIUM)
- [ ] **Task 4.2.1**: Create KB Agent specialist
  - Agent focused on KB queries
  - Use LlamaIndex QueryEngine
  - Optimize for retrieval quality
  - Handle multi-turn KB conversations
  - File: `src/lib/langchain/kb-agent.ts`

- [ ] **Task 4.2.2**: Build Research Agent
  - Agent for web search + synthesis
  - Use Tavily or Brave API
  - Combine multiple sources
  - Cite sources
  - File: `src/lib/langchain/research-agent.ts`

- [ ] **Task 4.2.3**: Implement Support Agent
  - Agent for order tracking, account queries
  - Connect to customer DB
  - Handle authentication
  - Return structured data
  - File: `src/lib/langchain/support-agent.ts`

- [ ] **Task 4.2.4**: Create Escalation Agent
  - Determine when to escalate to human
  - Check: unresolved, frustration, sensitive topics
  - Test precision (avoid false escalations)
  - File: `src/lib/langchain/escalation-agent.ts`

### 4.3 Multi-Agent Coordination (Priority: MEDIUM)
- [ ] **Task 4.3.1**: Build SupervisorAgent for routing
  - Meta-agent that routes to specialist agents
  - Use LLM for agent selection
  - Track agent performance
  - Load balance
  - File: `src/lib/langchain/supervisor-agent.ts`

- [ ] **Task 4.3.2**: Implement agent-to-agent delegation
  - Allow agents to delegate subtasks
  - Pass context between agents
  - Track delegation chains
  - Prevent circular delegation
  - File: `src/lib/langchain/agent-delegation.ts`

- [ ] **Task 4.3.3**: Add shared context management
  - Maintain global context across agent switches
  - Store in Redis
  - Include: entities, facts, user preferences
  - Test context preservation
  - File: `src/lib/langchain/shared-context.ts`

- [ ] **Task 4.3.4**: Build result aggregation
  - Combine outputs from multiple agents
  - Resolve conflicts
  - Format unified response
  - Add source attribution
  - File: `src/lib/langchain/multi-agent-aggregation.ts`

### 4.4 Guardrails & Safety (Priority: CRITICAL)
- [ ] **Task 4.4.1**: Implement input validation
  - Detect PII in queries
  - Block prompt injection attempts
  - Check input length limits
  - Return friendly error messages
  - File: `src/lib/langchain/input-validation.ts`

- [ ] **Task 4.4.2**: Add output filtering
  - Scan responses for profanity, violations
  - Use blocklist + LLM
  - Redact sensitive info
  - Test on adversarial inputs
  - File: `src/lib/langchain/output-filtering.ts`

- [ ] **Task 4.4.3**: Implement rate limiting
  - Per-tenant rate limits
  - Use Redis for counter
  - Return 429 with retry-after
  - Test with load generator
  - File: `src/lib/langchain/rate-limiter.ts`

- [ ] **Task 4.4.4**: Add audit logging for agents
  - Log all agent actions
  - Store in audit_logs table
  - Include: timestamp, tenant_id, agent_id, action
  - Retention 90d
  - File: `src/lib/langchain/agent-audit-log.ts`

---

## PHASE 5: Integration & Optimization (Days 13-15)

### 5.1 Unified Query Pipeline (Priority: CRITICAL)
- [ ] **Task 5.1.1**: Create HybridQueryPipeline class
  - Orchestrate full query flow
  - Handle errors at each stage
  - Add fallback paths
  - Test E2E latency
  - File: `src/lib/hybrid-query-pipeline.ts`

- [ ] **Task 5.1.2**: Implement layer-wise caching
  - Cache at: router, retrieval, synthesis
  - Use Redis with appropriate TTLs
  - Test cache effectiveness
  - File: `src/lib/hybrid-query-pipeline.ts`

- [ ] **Task 5.1.3**: Add circuit breakers
  - Protect external services
  - Track failure rate (5 min window)
  - Open circuit at >20% failures
  - Test recovery
  - File: `src/lib/circuit-breaker.ts`

### 5.2 Performance Optimization (Priority: HIGH)
- [ ] **Task 5.2.1**: Batch embedding operations
  - Batch embed up to 100 chunks at once
  - Use parallel requests (5 concurrent)
  - Test throughput improvement (10x target)
  - Handle partial failures
  - File: `src/lib/rag/llamaindex-batch-embeddings.ts`

- [ ] **Task 5.2.2**: Parallel tool execution
  - Execute independent tools concurrently
  - Set timeout per tool
  - Aggregate results
  - Measure latency reduction (30%)
  - File: `src/lib/langchain/parallel-tool-executor.ts`

- [ ] **Task 5.2.3**: Implement Redis caching strategy
  - Cache frequent queries, tool results, embeddings
  - Use LRU eviction
  - Monitor memory usage
  - Target cache hit rate >60%
  - File: `src/lib/redis-cache-manager.ts`

- [ ] **Task 5.2.4**: Add Supabase connection pooling
  - Use pgBouncer or pg pool
  - Configure pool size=20, max=50
  - Connection timeout=10s
  - Test under load
  - File: `src/lib/db/connection-pool.ts`

### 5.3 Observability (Priority: HIGH)
- [ ] **Task 5.3.1**: Implement distributed tracing
  - Use OpenTelemetry
  - Trace full query path
  - Tag with tenant_id, query_id
  - Export to Jaeger/Datadog
  - File: `src/lib/observability/tracing.ts`

- [ ] **Task 5.3.2**: Add stage-wise latency logging
  - Log latency for each stage
  - Alert on anomalies
  - Create latency dashboard
  - File: `src/lib/observability/latency-logger.ts`

- [ ] **Task 5.3.3**: Monitor cache hit rates
  - Track hit rate per cache layer
  - Alert if <40%
  - Analyze misses
  - Optimize cache keys and TTLs
  - File: `src/lib/observability/cache-monitor.ts`

- [ ] **Task 5.3.4**: Track tool usage patterns
  - Analyze most used tools, combinations
  - Create usage dashboard
  - Identify optimization opportunities
  - File: `src/lib/observability/tool-analytics.ts`

### 5.4 Testing & Validation (Priority: CRITICAL)
- [ ] **Task 5.4.1**: Create E2E test suite
  - Test full flow: query → routing → retrieval → synthesis
  - Cover: simple KB query, multi-tool, escalation
  - Target: 100 test cases, >95% pass rate
  - File: `tests/e2e-hybrid-pipeline.test.ts`

- [ ] **Task 5.4.2**: Build component tests
  - Test each component independently
  - Mock dependencies
  - File: `tests/component/*.test.ts`

- [ ] **Task 5.4.3**: Run load tests
  - Simulate 100 concurrent users
  - Test sustained load (1h)
  - Measure: throughput, latency, errors
  - Target: <1% errors
  - File: `tests/load/load-test.ts`

- [ ] **Task 5.4.4**: Quality tests with ground truth
  - Create golden dataset: 200 query-answer pairs
  - Measure answer accuracy (BLEU, ROUGE)
  - Test citation accuracy
  - Target: >85% answer quality score
  - File: `tests/quality/answer-quality.test.ts`

---

## Implementation Priority Matrix

### P0 - Critical (Must complete first)
- Tenant isolation for all components
- Intent classification & routing
- Hybrid search (vector + BM25)
- Basic conversation memory
- Input/output guardrails

### P1 - High (Core features)
- Metadata extraction & enrichment
- Reranking pipeline
- Multi-step workflows
- Tool orchestration
- Observability & tracing

### P2 - Medium (Enhancement)
- Query transformation (HyDE, decomposition)
- Specialized agents
- Multi-agent coordination
- Advanced caching strategies

### P3 - Low (Nice to have)
- Query rewriting
- Entity memory
- Agent delegation
- Advanced visualization

---

## Success Metrics

**RAG Quality (LlamaIndex)**
- Retrieval precision: >0.85
- Retrieval recall: >0.80
- Reranking improvement: +15%
- Delta update latency: <2s

**Orchestration Quality (LangChain)**
- Intent classification accuracy: >0.90
- Conversation coherence: >0.85
- Tool selection accuracy: >0.88
- Handoff precision: <5% false escalations

**Performance**
- P50 latency: <500ms
- P95 latency: <1500ms
- Concurrent users: 1000+
- Cache hit rate: >60%

**Reliability**
- Uptime: 99.9%
- Error rate: <0.1%
- Timeout rate: <1%
