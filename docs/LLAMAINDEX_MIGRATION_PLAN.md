# LlamaIndex Migration Plan

**Date:** November 21, 2025  
**Status:** Planning Phase  
**Priority:** High  
**Impact:** Core RAG Framework Refactoring

## Executive Summary

This document outlines a systematic, phase-based migration from LangChain to LlamaIndex for the RAG (Retrieval-Augmented Generation) framework. The migration follows a **fail-safe, incremental approach** with validation at each step to ensure zero downtime and maintain all security guarantees (tenant isolation, audit logging, rate limiting).

---

## Current State Analysis

### LangChain Dependencies Inventory

#### **Core RAG Components** (Critical Path)
1. **`src/lib/rag/supabase-retriever.ts`** (247 lines)
   - `@langchain/community/vectorstores/supabase` - SupabaseVectorStore
   - BAAI/bge-large-en-v1.5 - Local Embeddings
   - `@langchain/core/documents` - Document class
   - **Functions:** `getSupabaseRetriever()`, `addDocumentsToTenant()`, `deleteTenantEmbeddings()`
   - **Security:** Tenant isolation, RLS enforcement, audit logging

2. **`src/lib/rag/supabase-retriever-v2.ts`** (202 lines)
   - `@langchain/core/documents` - Document class
   - Wraps v1 retriever with caching (Redis) and retry logic
   - **Functions:** `TenantIsolatedRetriever.create()`

3. **`src/lib/rag/tenant-isolation.ts`** (88 lines)
   - `@langchain/core/documents` - Document class
   - **Security Critical:** `TenantIsolationGuard`, `enforceWriteIsolation()`, `validateRetrievedDocuments()`

4. **`src/lib/rag/llm-factory.ts`** (120 lines)
   - `@langchain/openai` - ChatOpenAI
   - `@langchain/core/messages` - HumanMessage
   - **Adapters:** `LangChainOpenAIAdapter` wraps ChatOpenAI for unified interface

5. **`src/lib/rag/bitb-rag.ts`** (361 lines)
   - `@langchain/core/prompts` - ChatPromptTemplate
   - `@langchain/core/output_parsers` - StringOutputParser
   - In-memory RAG with Xenova embeddings (legacy path)

#### **Trial Workflow Integration** (Secondary Path)
6. **`src/lib/trial/workflow-langchain.ts`** (469 lines)
   - `@langchain/openai` - ChatOpenAI
   - `@langchain/core/prompts` - PromptTemplate
   - LLM-based KB quality assessment, tool recommendation

7. **`src/lib/trial/workflow-engine.ts`** (1043+ lines)
   - `@langchain/openai` - ChatOpenAI
   - `@langchain/core/messages` - HumanMessage, SystemMessage
   - Trial automation with LLM intelligence

#### **MCP & API Integration**
8. **`src/lib/mcp/handlers.ts`**
   - Imports `getSupabaseRetriever` from supabase-retriever.ts

9. **`src/app/api/ask/route.ts`**
   - Imports `getSupabaseRetriever` from supabase-retriever.ts

### Dependencies to Install

```json
{
  "@llamaindex/core": "^0.2.0",
  "@llamaindex/openai": "^0.2.0",
  "@llamaindex/community": "^0.2.0"
}
```

**Note:** LlamaIndex for TypeScript uses scoped packages under `@llamaindex/*`.

---

## Migration Phases

### **Phase 1: Foundation & Document Abstraction** ⭐ (Week 1)
**Goal:** Create compatibility layer for Document types without breaking existing code.

#### Tasks:
1. **Install LlamaIndex packages**
   ```bash
   npm install @llamaindex/core @llamaindex/openai @llamaindex/community --legacy-peer-deps
   ```

2. **Create Document adapter layer** (`src/lib/rag/llamaindex-adapters.ts`)
   - Map LangChain `Document` ↔ LlamaIndex `Document`
   - Preserve `metadata.tenant_id` across conversions
   - Type-safe wrappers

3. **Update tenant-isolation.ts**
   - Support both LangChain and LlamaIndex Document types
   - Maintain existing security guarantees
   - Add runtime type guards

4. **Testing:**
   - Unit tests for Document conversion
   - Verify tenant_id preservation
   - Security audit for isolation logic

**Rollback Plan:** Remove adapter file, revert tenant-isolation.ts

---

### **Phase 2: Embedding Service Migration** (Week 1-2)
**Goal:** Replace OpenAIEmbeddings with LlamaIndex equivalent.

#### Tasks:
1. **Create new embedding service** (`src/lib/rag/llamaindex-embeddings.ts`)
   - Use BAAI/bge-large-en-v1.5 via local Python service
   - Maintain same interface as LangChain version
   - Support batch operations

2. **Feature parity checks:**
   - Embedding dimensions (1024 for `BAAI/bge-large-en-v1.5`)
   - Batch size limits (same as LangChain)
   - Error handling and retries

3. **Parallel testing:**
   - Run both LangChain and LlamaIndex embeddings side-by-side
   - Compare vector outputs for identical inputs
   - Performance benchmarking (latency, throughput)

4. **Switch embedding service in:**
   - `addDocumentsToTenant()` first (write path)
   - Monitor ingestion jobs for 48 hours
   - Rollback if error rate > 0.1%

**Rollback Plan:** Toggle environment variable `USE_LLAMAINDEX_EMBEDDINGS=false`

---

### **Phase 3: Vector Store Migration** ⚠️ (Week 2-3)
**Goal:** Replace SupabaseVectorStore with LlamaIndex SupabaseVectorStore.

#### Tasks:
1. **Research LlamaIndex Supabase integration:**
   - Check if `@llamaindex/community` has `SupabaseVectorStore`
   - If not, create custom vector store using `@llamaindex/core` base classes
   - Ensure support for custom SQL functions (`match_embeddings_by_tenant`)

2. **Create new vector store adapter** (`src/lib/rag/llamaindex-supabase-store.ts`)
   - Replicate tenant isolation logic
   - Support `filter: { match_tenant_id: tenantId }`
   - Maintain RLS context setting

3. **Refactor `getSupabaseRetriever()`:**
   - Create `getSupabaseRetrieverV3()` with LlamaIndex backend
   - Run A/B test: 10% traffic to v3, 90% to v2
   - Compare retrieval quality (precision, recall)

4. **Security validation:**
   - Cross-tenant retrieval tests (must fail)
   - Audit log verification
   - Load testing with concurrent tenants

5. **Gradual rollout:**
   - Day 1: 10% traffic
   - Day 3: 50% traffic
   - Day 5: 100% traffic
   - Monitor error rates and latency

**Rollback Plan:** Flip feature flag `RAG_VECTOR_STORE_VERSION=v2`

---

### **Phase 4: Retriever Interface Unification** (Week 3-4)
**Goal:** Standardize all retrieval through LlamaIndex.

#### Tasks:
1. **Update `supabase-retriever-v2.ts`:**
   - Replace internal LangChain retriever with LlamaIndex
   - Maintain Redis caching logic
   - Keep retry/circuit breaker patterns

2. **Refactor `TenantIsolatedRetriever`:**
   - Use LlamaIndex `BaseRetriever` interface
   - Preserve all security wrappers
   - Update type signatures

3. **Integration testing:**
   - Run full ingestion → retrieval → generation pipeline
   - Test with real tenant data (staging environment)
   - Validate response quality matches baseline

4. **Update all consumers:**
   - `src/app/api/ask/route.ts`
   - `src/lib/mcp/handlers.ts`
   - Verify no breaking changes in API responses

**Rollback Plan:** Revert file changes via Git, redeploy previous version

---

### **Phase 5: LLM Factory Migration** (Week 4)
**Goal:** Replace LangChain ChatOpenAI with LlamaIndex LLM.

#### Tasks:
1. **Create LlamaIndex LLM adapter** (`src/lib/rag/llamaindex-llm-factory.ts`)
   - Use `@llamaindex/openai` - `OpenAI` class
   - Maintain `LLMAdapter` interface
   - Support Groq and OpenAI providers

2. **Update `llm-factory.ts`:**
   - Add LlamaIndex branch to `createLlm()`
   - Feature flag: `USE_LLAMAINDEX_LLM=true`
   - Parallel testing with both implementations

3. **Prompt template migration:**
   - LangChain `ChatPromptTemplate` → LlamaIndex equivalent
   - Test prompt formatting consistency
   - Validate output parsing

4. **Testing:**
   - Compare LLM responses (same prompts, both providers)
   - Latency and token usage metrics
   - Error handling for rate limits, timeouts

**Rollback Plan:** Set `USE_LLAMAINDEX_LLM=false`

---

### **Phase 6: Workflow Engine Migration** (Week 5)
**Goal:** Migrate trial workflow LangChain dependencies.

#### Tasks:
1. **Update `workflow-langchain.ts`:**
   - Rename to `workflow-llm.ts` (provider-agnostic)
   - Replace LangChain imports with LlamaIndex
   - Maintain semantic analysis logic

2. **Update `workflow-engine.ts`:**
   - Switch to LlamaIndex LLM
   - Validate KB quality assessment accuracy
   - Test tool recommendation logic

3. **Trial flow testing:**
   - End-to-end trial signup → KB upload → assessment
   - Compare old vs. new workflow outputs
   - User acceptance testing (UAT)

**Rollback Plan:** Revert workflow files, redeploy

---

### **Phase 7: Cleanup & Deprecation** (Week 6)
**Goal:** Remove all LangChain dependencies.

#### Tasks:
1. **Deprecate legacy code:**
   - Mark `getBitbRag()` as deprecated (already done)
   - Remove unused LangChain imports
   - Delete old adapter files

2. **Update package.json:**
   - Remove `@langchain/*` dependencies
   - Audit for unused transitive deps
   - Run `npm prune`

3. **Documentation updates:**
   - Update architecture diagrams
   - RAG pipeline documentation
   - API integration guides

4. **Final validation:**
   - Full regression test suite
   - Performance benchmarks vs. baseline
   - Security audit (tenant isolation, RLS)

---

## Risk Assessment & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Tenant data leakage during migration** | 🔴 Critical | Maintain dual security layers, extensive cross-tenant tests |
| **Embedding dimension mismatch** | 🟡 High | Validate vector dimensions before switching |
| **Performance degradation** | 🟡 High | A/B testing with real traffic, gradual rollout |
| **Breaking API changes** | 🟡 High | Version API endpoints, maintain backwards compatibility |
| **LlamaIndex lacks Supabase support** | 🟠 Medium | Build custom vector store using base classes |
| **Documentation gaps** | 🟢 Low | Extensive inline comments, runbook updates |

---

## Success Metrics

### Performance
- **Latency:** < 500ms p95 for retrieval (same as baseline)
- **Throughput:** > 100 queries/sec per tenant
- **Memory:** < 512MB per worker process

### Quality
- **Retrieval precision:** > 85% (compared to baseline)
- **Answer relevance:** > 90% (human eval)
- **Hallucination rate:** < 2%

### Security
- **Zero cross-tenant data leaks** (monitored via audit logs)
- **100% RLS enforcement** (automated tests)
- **Audit log coverage:** 100% of retrieval operations

### Reliability
- **Uptime:** > 99.9% during migration
- **Error rate:** < 0.1% (same as baseline)
- **Rollback time:** < 5 minutes (any phase)

---

## Timeline Summary

| Phase | Duration | Dependencies | Risk Level |
|-------|----------|--------------|-----------|
| Phase 1: Foundation | 1 week | None | 🟢 Low |
| Phase 2: Embeddings | 1 week | Phase 1 | 🟢 Low |
| Phase 3: Vector Store | 1-2 weeks | Phase 2 | 🔴 High |
| Phase 4: Retriever | 1 week | Phase 3 | 🟡 Medium |
| Phase 5: LLM Factory | 1 week | Phase 4 | 🟡 Medium |
| Phase 6: Workflows | 1 week | Phase 5 | 🟢 Low |
| Phase 7: Cleanup | 1 week | Phase 6 | 🟢 Low |
| **Total** | **6-7 weeks** | | |

---

## Rollback Strategy

Each phase includes:
1. **Feature flags** for instant rollback
2. **Git tags** before each deployment
3. **Database migrations** are reversible
4. **Monitoring dashboards** with alerts
5. **Automated health checks** post-deployment

**Global Rollback:** Set `RAG_FRAMEWORK=langchain` to revert entire stack.

---

## Testing Strategy

### Unit Tests
- Document conversion functions
- Tenant isolation guards
- Embedding service parity

### Integration Tests
- Full ingestion pipeline (upload → embed → store)
- Retrieval accuracy (query → retrieve → rank)
- LLM generation (retrieve → generate → stream)

### Security Tests
- Cross-tenant isolation (negative tests)
- RLS bypass attempts (penetration testing)
- Audit log verification

### Performance Tests
- Load testing (1000 concurrent users)
- Stress testing (10x normal load)
- Soak testing (24 hours sustained load)

---

## Open Questions

1. **Q:** Does LlamaIndex have native Supabase vector store support?  
   **A:** TBD - need to check `@llamaindex/community` or build custom.

2. **Q:** Can we maintain pgvector custom functions (`match_embeddings_by_tenant`)?  
   **A:** Yes - use LlamaIndex `CustomVectorStore` if needed.

3. **Q:** Will migration affect existing embeddings in database?  
   **A:** No - embeddings are provider-agnostic (just float arrays).

4. **Q:** Do we need to re-embed all documents?  
   **A:** No - only if embedding model changes (not in this plan).

---

## Next Steps

1. ✅ **Create migration plan** (this document)
2. 🔄 **Install LlamaIndex packages** (Phase 1, Task 1)
3. 🔄 **Create Document adapter layer** (Phase 1, Task 2)
4. ⏳ **Set up staging environment** for parallel testing
5. ⏳ **Baseline metrics collection** (latency, accuracy, error rates)

---

## Approval & Sign-off

- [ ] **Engineering Lead:** Review technical approach
- [ ] **Security Team:** Approve tenant isolation strategy
- [ ] **Product Manager:** Validate rollout timeline
- [ ] **DevOps:** Confirm monitoring and rollback procedures

---

**Document Version:** 1.0  
**Last Updated:** November 21, 2025  
**Owner:** AI Assistant & Engineering Team
