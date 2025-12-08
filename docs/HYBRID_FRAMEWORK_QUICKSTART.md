# Hybrid Framework Quick Reference

## Architecture Summary

**Strategy**: Use each framework for its strengths
- **LlamaIndex**: RAG pipeline (ingestion → chunking → embeddings → retrieval)
- **LangChain**: Orchestration layer (routing → workflows → tools → agents)

---

## Component Ownership

| Layer | Framework | Components |
|-------|-----------|------------|
| **Data Ingestion** | 🦙 LlamaIndex | SentenceSplitter, SemanticSplitter, HierarchicalNodeParser |
| **Metadata** | 🦙 LlamaIndex | KeywordExtractor, SummaryExtractor, QuestionsAnsweredExtractor |
| **Vector Store** | 🦙 LlamaIndex | TenantIsolatedVectorStore, StorageContext, IngestionCache |
| **Retrieval** | 🦙 LlamaIndex | VectorStoreRetriever, BM25Retriever, QueryFusionRetriever |
| **Reranking** | 🦙 LlamaIndex | SentenceTransformerRerank, CohereRerank |
| **Query Transform** | 🦙 LlamaIndex | HyDEQueryTransform, StepDecomposeQueryTransform |
| **Subquery** | 🦙 LlamaIndex | SubQuestionQueryEngine, MultiStepQueryEngine |
| **Intent Routing** | 🦙🔗 LangChain | LLMRouterChain, RouteDecision |
| **Memory** | 🦙🔗 LangChain | ConversationBufferMemory, ConversationSummaryMemory, EntityMemory |
| **Workflows** | 🦙🔗 LangChain | SequentialChain, ConditionalChain, LoopChain |
| **Tools** | 🦙🔗 LangChain | ToolExecutor, Tool schemas, Tool caching |
| **Agents** | 🦙🔗 LangChain | ReActAgent, KBAgent, ResearchAgent, SupervisorAgent |
| **Guardrails** | 🦙🔗 LangChain | InputValidator, OutputFilter, RateLimiter |

---

## Data Flow

```
User Query
    ↓
┌─────────────────────────────────────┐
│   LangChain: Intent Classification  │ ← ConversationMemory
│   Router determines: KB, Web, Tool  │
└─────────────────────────────────────┘
    ↓
    ├─ KB Query Path
    │   ↓
    │   ┌─────────────────────────────────┐
    │   │  LlamaIndex: Query Transform    │
    │   │  HyDE / Decomposition           │
    │   └─────────────────────────────────┘
    │   ↓
    │   ┌─────────────────────────────────┐
    │   │  LlamaIndex: Hybrid Retrieval   │
    │   │  Vector + BM25 + Fusion         │
    │   └─────────────────────────────────┘
    │   ↓
    │   ┌─────────────────────────────────┐
    │   │  LlamaIndex: Reranking          │
    │   │  SentenceTransformer / Cohere   │
    │   └─────────────────────────────────┘
    │   ↓
    │   ┌─────────────────────────────────┐
    │   │  LangChain: Synthesis           │
    │   │  LLM + Context + Memory         │
    │   └─────────────────────────────────┘
    │
    ├─ Web Search Path
    │   ↓
    │   ┌─────────────────────────────────┐
    │   │  LangChain: Tool Execution      │
    │   │  Tavily / Brave API             │
    │   └─────────────────────────────────┘
    │
    └─ Multi-Step Path
        ↓
        ┌─────────────────────────────────┐
        │  LangChain: Agent System        │
        │  ReAct / Multi-Agent            │
        └─────────────────────────────────┘
    ↓
Response + Sources + Metadata
```

---

## API Quick Reference

### Ingestion

```typescript
import { TenantIngestionPipeline } from '@/lib/rag/llamaindex-ingestion-pipeline';

const pipeline = new TenantIngestionPipeline({
  chunkingStrategy: 'semantic',
  chunkSize: 512,
  extractors: ['keywords', 'summary', 'questions'],
  embedModel: 'text-embedding-ada-002',
  cacheEnabled: true,
});

const report = await pipeline.ingest(documents, tenantId);
```

### Retrieval

```typescript
import { HybridQueryEngine } from '@/lib/rag/llamaindex-query-engine';

const engine = new HybridQueryEngine({
  hybridSearchEnabled: true,
  hybridAlpha: 0.5, // 50% vector, 50% keyword
  reranker: 'sentence-transformer',
  rerankTopK: 5,
});

const result = await engine.query(query, tenantId, {
  filters: [{ key: 'tenant_id', value: tenantId }],
  rerank: true,
});
```

### Orchestration

```typescript
import { ConversationOrchestrator } from '@/lib/langchain/orchestrator';

const orchestrator = new ConversationOrchestrator({
  routerModel: 'gpt-4o-mini',
  memoryType: 'buffer',
  guardrailsEnabled: true,
});

const response = await orchestrator.handleMessage(message, sessionId, {
  tenantId,
  userId,
  conversationHistory,
});
```

### Unified Pipeline

```typescript
import { HybridQueryPipeline } from '@/lib/hybrid-query-pipeline';

const pipeline = new HybridQueryPipeline({
  orchestratorConfig: { ... },
  queryEngineConfig: { ... },
  caching: { enabled: true, layers: ['router', 'retrieval', 'synthesis'] },
});

const response = await pipeline.process(query, {
  tenantId,
  userId,
  sessionId,
});
```

---

## Key Files

### Configuration
- `docs/HYBRID_FRAMEWORK_ARCHITECTURE.md` - High-level architecture
- `docs/HYBRID_FRAMEWORK_SPECS.md` - Technical specifications
- `TODO_HYBRID_IMPLEMENTATION.md` - Implementation checklist (77 tasks)

### LlamaIndex (RAG)
- `src/lib/rag/llamaindex-chunking.ts` - Advanced chunking strategies
- `src/lib/rag/llamaindex-metadata-extractors.ts` - Metadata extraction
- `src/lib/rag/llamaindex-tenant-vector-store.ts` - Tenant isolation
- `src/lib/rag/llamaindex-query-engine.ts` - Hybrid search + reranking
- `src/lib/rag/llamaindex-ingestion-cache.ts` - Embedding cache
- `src/lib/rag/llamaindex-sync-jobs.ts` - Delta updates

### LangChain (Orchestration)
- `src/lib/langchain/orchestrator.ts` - Main orchestration layer
- `src/lib/langchain/router-chain.ts` - Intent classification
- `src/lib/langchain/conversation-buffer-memory.ts` - Memory management
- `src/lib/langchain/sequential-chain.ts` - Multi-step workflows
- `src/lib/langchain/tool-executor.ts` - Tool execution
- `src/lib/langchain/react-agent.ts` - Agent implementation
- `src/lib/langchain/supervisor-agent.ts` - Multi-agent coordination
- `src/lib/langchain/input-validation.ts` - Guardrails

### Integration
- `src/lib/hybrid-query-pipeline.ts` - Unified pipeline
- `src/lib/circuit-breaker.ts` - Circuit breaker
- `src/lib/redis-cache-manager.ts` - Multi-layer caching
- `src/lib/observability/tracing.ts` - Distributed tracing

---

## Feature Flags

```bash
# LlamaIndex Features
USE_LLAMAINDEX_INGESTION=true
USE_SEMANTIC_CHUNKING=true
USE_HYBRID_SEARCH=true
ENABLE_RERANKING=true
ENABLE_SUBQUERY_DECOMPOSITION=false

# LangChain Features
USE_LANGCHAIN_ORCHESTRATION=true
ENABLE_MULTI_AGENT=false
ENABLE_WEB_SEARCH_TOOL=true
CONVERSATION_MEMORY_TYPE=buffer

# Hybrid Pipeline
RAG_BACKEND=hybrid  # llamaindex|langchain|hybrid
ORCHESTRATION_BACKEND=langchain
PIPELINE_CACHING_ENABLED=true
```

---

## Performance Targets

| Metric | Target | Measured At |
|--------|--------|-------------|
| P50 Latency | <500ms | End-to-end |
| P95 Latency | <1500ms | End-to-end |
| Retrieval Precision | >0.85 | Top-5 results |
| Retrieval Recall | >0.80 | All relevant docs |
| Intent Accuracy | >0.90 | Classification |
| Cache Hit Rate | >60% | Redis |
| Concurrent Users | 1000+ | Load test |
| Error Rate | <0.1% | 5-min window |

---

## Testing Strategy

### Unit Tests
- ✅ Chunking strategies (sentence, semantic, hierarchical)
- ✅ Metadata extractors (keywords, summary, questions)
- ✅ Retrieval methods (vector, BM25, hybrid)
- ✅ Reranking algorithms
- ✅ Memory management
- ✅ Intent classification
- ✅ Tool execution

### Integration Tests
- [ ] Ingestion → Storage → Retrieval
- [ ] Query → Routing → Tool → Response
- [ ] Multi-agent coordination
- [ ] Cache invalidation
- [ ] Circuit breaker activation

### E2E Tests
- [ ] Simple KB query
- [ ] Multi-tool query (KB + Web)
- [ ] Multi-turn conversation
- [ ] Escalation to human
- [ ] Error recovery

### Load Tests
- [ ] 100 concurrent users (sustained 1h)
- [ ] 1000 queries/sec (burst)
- [ ] Memory usage under load
- [ ] Cache effectiveness

---

## Monitoring & Observability

### Metrics to Track
- **Latency**: Per-stage latency (routing, retrieval, reranking, synthesis)
- **Throughput**: Queries per second
- **Cache**: Hit rate per layer (router, retrieval, synthesis)
- **Tools**: Invocation count, success rate, latency
- **Agents**: Iterations, delegations, errors
- **Quality**: Retrieval precision, answer accuracy

### Dashboards
1. **RAG Pipeline**: Ingestion rate, embedding latency, retrieval quality
2. **Orchestration**: Intent distribution, routing accuracy, memory usage
3. **Performance**: Latency percentiles, throughput, error rates
4. **Cost**: Token usage, API calls, cache savings

### Alerts
- Latency P95 > 2s
- Error rate > 0.5%
- Cache hit rate < 40%
- Tool failure rate > 10%
- Circuit breaker open

---

## Migration Checklist

### Week 1: Foundation
- [x] Architecture review and approval
- [ ] Set up development environment
- [ ] Implement basic LlamaIndex ingestion
- [ ] Create TenantIsolatedVectorStore
- [ ] Add simple LangChain router

### Week 2: Enhancement
- [ ] Advanced chunking (semantic, hierarchical)
- [ ] Hybrid search (vector + BM25)
- [ ] Reranking pipeline
- [ ] Conversation memory
- [ ] Multi-step workflows

### Week 3: Advanced Features
- [ ] Query transformation (HyDE, decomposition)
- [ ] Tool orchestration
- [ ] Agent system (ReAct)
- [ ] Multi-agent coordination

### Week 4: Production Ready
- [ ] Guardrails (input/output validation)
- [ ] Distributed tracing
- [ ] Load testing
- [ ] Documentation
- [ ] Runbooks

---

## Common Patterns

### Pattern 1: Simple KB Query
```typescript
// User: "What is BiTB?"
Router → KB_QUERY
→ LlamaIndex: Hybrid search (vector + BM25)
→ LlamaIndex: Rerank top-20 to top-5
→ LangChain: Synthesize answer with memory
→ Response
```

### Pattern 2: Multi-Step Query
```typescript
// User: "Compare BiTB pricing with competitors"
Router → MULTI_STEP
→ LangChain: Decompose into subtasks
  ├─ LlamaIndex: Query KB for BiTB pricing
  ├─ LangChain: Web search for competitor pricing
  └─ LangChain: Synthesize comparison
→ Response
```

### Pattern 3: Conversation with Context
```typescript
// User: "How much does it cost?" (after discussing BiTB)
Router → KB_QUERY
→ LangChain: Load conversation memory
→ LangChain: Resolve "it" → "BiTB" (entity tracking)
→ LlamaIndex: Query KB with context
→ LangChain: Synthesize with memory
→ Response
```

### Pattern 4: Agent-Based Research
```typescript
// User: "Create a report on BiTB security features"
Router → AGENT_TASK
→ LangChain: SupervisorAgent assigns to ResearchAgent
→ ResearchAgent: Multi-step plan
  ├─ Query KB for security docs
  ├─ Web search for certifications
  ├─ Query KB for compliance docs
  └─ Synthesize report
→ Response with structured report
```

---

## Troubleshooting

### Issue: High latency (>2s)
**Check:**
1. Cache hit rate (should be >60%)
2. Reranking enabled? (adds 100-200ms)
3. Number of retrieved docs (reduce top_k)
4. LLM model choice (use gpt-4o-mini for speed)

### Issue: Low retrieval quality
**Check:**
1. Chunking strategy (try semantic vs sentence)
2. Hybrid alpha parameter (tune 0.3-0.7)
3. Reranking enabled?
4. Metadata filters correct?

### Issue: Intent misclassification
**Check:**
1. Router model (upgrade to gpt-4o-mini)
2. Few-shot examples in prompt
3. Confidence thresholds (lower if too many rejections)
4. Conversation context passed to router?

### Issue: Memory errors
**Check:**
1. Memory type (buffer vs summary)
2. Memory window size (reduce if OOM)
3. Redis memory limit
4. Session cleanup (expired sessions)

---

## Support & Resources

- **Architecture Docs**: `docs/HYBRID_FRAMEWORK_ARCHITECTURE.md`
- **API Specs**: `docs/HYBRID_FRAMEWORK_SPECS.md`
- **TODO List**: `TODO_HYBRID_IMPLEMENTATION.md` (77 tasks)
- **LlamaIndex Docs**: https://docs.llamaindex.ai/
- **LangChain Docs**: https://python.langchain.com/docs/
- **Migration Guide**: This file (Quick Reference)
